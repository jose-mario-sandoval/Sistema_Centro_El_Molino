-- Administradora hereda exclusivamente las capacidades existentes de Administracion.
-- No se cambian mi_rol(), roles con comidas, permisos de Director ni cuentas existentes.


create or replace function public.mensajes_forzar_estado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol public.rol := (select public.mi_rol());
begin
  if tg_op = 'INSERT' then
    -- Director y Administración publican directo. mi_rol() nulo (cuenta inactiva o llave secreta):
    -- `null in (...)` es null y el case cae en pendiente.
    new.estado := case when v_rol in ('director', 'administracion', 'administradora') then 'aprobado' else 'pendiente' end;
    new.motivo_rechazo := null;
    -- authenticated tiene INSERT sobre toda la tabla: nadie publica algo ya fijado...
    new.fijado_en := null;
    new.fijado_hasta := null;
    new.fijado_por := null;
    -- ...ni con una fecha inventada (una de 2099 quedaría primera en el feed para siempre, y la cola de
    -- moderación mostraría esa hora). Sin sesión (llave secreta: siembras y pruebas) se respeta la que venga.
    if (select auth.uid()) is not null then
      new.creado_en := now();
    end if;
    -- Una respuesta hereda la visibilidad de su publicación (quien responde ya la ve: RLS). Una
    -- publicación es privada si quien la escribe lo pide, sea cual sea su rol (con la cuenta activa). Sin
    -- sesión (siembras y pruebas) se respeta la que venga.
    if new.padre_id is not null then
      new.solo_director := coalesce(
        (select m.solo_director from public.mensajes m where m.id = new.padre_id),
        false
      );
    elsif (select auth.uid()) is not null then
      new.solo_director := new.solo_director and v_rol is not null;
    end if;
    return new;
  end if;

  -- La visibilidad no cambia después de publicar.
  new.solo_director := old.solo_director;

  -- Quien no es Director vuelve el mensaje a pendiente solo si toca el contenido o corrige un rechazo
  -- (aunque reenvíe el mismo texto). Así fijar/desfijar desde Administración (que pasa por acá con su
  -- propio rol, aunque las funciones sean security definer) no lo des-aprueba.
  -- "is distinct from" y no "<>": mi_rol() nulo (cuenta recién desactivada, JWT todavía válido) no
  -- debe poder autoaprobarse (ver 20260921220000_aprobacion_mensajes.sql).
  if v_rol is distinct from 'director' and (
    old.estado = 'rechazado'
    or new.texto is distinct from old.texto
    or new.estado is distinct from old.estado
    or new.motivo_rechazo is distinct from old.motivo_rechazo
  ) then
    new.estado := 'pendiente';
    new.motivo_rechazo := null;
  end if;

  -- Lo que deja de estar aprobado deja de estar fijado.
  if new.estado <> 'aprobado' then
    new.fijado_en := null;
    new.fijado_hasta := null;
    new.fijado_por := null;
  end if;
  return new;
end;
$$;

create or replace function public.fijar_mensaje(p_id uuid, p_hasta timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fijado_en timestamptz;
begin
  -- mi_rol() ya exige cuenta activa; coalesce: sin rol no hay permiso.
  if not coalesce((select public.mi_rol()) in ('director', 'administracion', 'administradora'), false) then
    raise exception 'Solo el Director y Administración fijan publicaciones' using errcode = '42501';
  end if;
  if p_hasta is not null and p_hasta <= now() then
    raise exception 'El fin de lo fijado ya pasó' using errcode = '22023';
  end if;

  -- Volver a fijar una fijada reemplaza fin y autor, y la sube arriba de las demás.
  update public.mensajes
     set fijado_en = now(),
         fijado_hasta = p_hasta,
         fijado_por = (select auth.uid())
   where id = p_id
     and padre_id is null
     and estado = 'aprobado'
  returning fijado_en into v_fijado_en;

  if not found then
    raise exception 'No hay una publicación aprobada con ese id' using errcode = 'P0002';
  end if;
  return v_fijado_en;
end;
$$;

create or replace function public.desfijar_mensaje(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select public.mi_rol()) in ('director', 'administracion', 'administradora'), false) then
    raise exception 'Solo el Director y Administración quitan publicaciones fijadas' using errcode = '42501';
  end if;

  -- Solo filas fijadas (y por lo tanto aprobadas): un UPDATE sobre un rechazado, viniendo de
  -- Administración, lo devolvería a pendiente en el trigger.
  update public.mensajes
     set fijado_en = null,
         fijado_hasta = null,
         fijado_por = null
   where id = p_id
     and fijado_en is not null;

  -- Ya desfijada (dos personas la quitan a la vez): no es error. Solo entre las aprobadas: esta función no
  -- pasa por RLS, y distinguir "existe pero no la ves" de "no existe" delataría pendientes y rechazados ajenos.
  if not found and not exists (
    select 1 from public.mensajes m where m.id = p_id and m.padre_id is null and m.estado = 'aprobado'
  ) then
    raise exception 'No hay una publicación aprobada con ese id' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.puedo_leer_mensaje(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.soy_activo()) and exists (
    select 1
    from public.mensajes m
    left join public.mensajes padre on padre.id = m.padre_id
    where m.id = p_id
      and (m.estado = 'aprobado' or m.autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
      and (
        m.padre_id is null
        or (
          padre.id is not null and padre.padre_id is null
          and (padre.estado = 'aprobado' or padre.autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
        )
      )
      and (
        not coalesce(padre.solo_director, m.solo_director)
        or coalesce(padre.autor_id, m.autor_id) = (select auth.uid())
        or (select public.mi_rol()) in ('director', 'administracion', 'administradora')
      )
  );
$$;

create or replace function public.reservar_avisos_mensaje(
  p_mensaje_id uuid,
  p_revision bigint,
  p_tipo text,
  p_suscripciones uuid[]
)
returns uuid[]
language sql
security definer
set search_path = ''
as $$
  with reservados as (
    insert into public.avisos_mensaje_push (mensaje_id, revision, tipo, suscripcion_id)
    select m.id, m.aviso_revision, p_tipo, s.id
    from public.mensajes m
    left join public.mensajes padre on padre.id = m.padre_id
    join public.suscripciones_push s on s.id = any(p_suscripciones)
    join public.perfiles p on p.id = s.usuario_id
    where m.id = p_mensaje_id and m.aviso_revision = p_revision
      and p.activo and p.avisar_mensajes
      -- Una respuesta no revela tampoco la existencia de una publicación que no se puede leer.
      and (m.padre_id is null or (
        padre.padre_id is null
        and (p.rol = 'director' or padre.autor_id = p.id or (
          padre.estado = 'aprobado'
          and (not padre.solo_director or p.rol in ('administracion', 'administradora'))
        ))
      ))
      and case
        when p_tipo in ('publicacion', 'respuesta') then
          m.estado = 'aprobado' and p.id <> m.autor_id
          and ((p_tipo = 'publicacion' and m.padre_id is null)
            or (p_tipo = 'respuesta' and m.padre_id is not null and padre.estado = 'aprobado'))
          and (not (m.solo_director or coalesce(padre.solo_director, false))
            or p.rol in ('director', 'administracion', 'administradora') or p.id = coalesce(padre.autor_id, m.autor_id))
        when p_tipo = 'pendiente' then
          m.estado = 'pendiente' and p.rol = 'director' and p.id <> m.autor_id
        when p_tipo = 'moderacion' then
          m.estado in ('aprobado', 'rechazado') and p.id = m.autor_id
        else false
      end
    on conflict do nothing
    returning suscripcion_id
  )
  select coalesce(array_agg(suscripcion_id), '{}'::uuid[]) from reservados;
$$;

create or replace function public.ausentes_en(p_fecha date)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- distinct: una persona puede tener rangos que se solapan y debe aparecer una sola vez.
  select distinct a.usuario_id
    from public.ausencias a
   where (select public.mi_rol()) in ('administracion', 'administradora')
     and p_fecha between a.desde and a.hasta
$$;

create or replace function public.extras_de_la_semana(p_desde date, p_hasta date)
returns table (fecha date, tiempo_comida public.tiempo_comida, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select x.fecha, x.tiempo_comida, sum(x.cantidad)::integer as total
    from (
      select e.fecha, l.tiempo_comida, c.cantidad_personas::integer as cantidad
        from public.confirmaciones_extra c
        join public.enlaces_confirmacion l on l.id = c.enlace_id
        join public.eventos e on e.id = l.evento_id
       where e.fecha between p_desde and p_hasta
      union all
      select m.fecha, m.tiempo_comida, m.cantidad::integer
        from public.extras_manuales m
       where m.fecha between p_desde and p_hasta
    ) x
   where (select public.mi_rol()) in ('administracion', 'administradora', 'director')
   group by x.fecha, x.tiempo_comida
$$;

create or replace function public.extras_manuales_de_la_semana(p_desde date, p_hasta date)
returns table (id uuid, fecha date, tiempo_comida public.tiempo_comida, cantidad integer, nota text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.fecha, m.tiempo_comida, m.cantidad::integer, m.nota
    from public.extras_manuales m
   where (select public.mi_rol()) in ('administracion', 'administradora', 'director')
     and m.fecha between p_desde and p_hasta
   order by m.fecha, m.tiempo_comida, m.creado_en
$$;

drop policy "plan_semanal: lectura propia, de Administración o del Director" on public.plan_semanal;
create policy "plan_semanal: lectura propia, de Administración o del Director"
  on public.plan_semanal for select
  to authenticated
  using (
    (select public.soy_activo())
    and (usuario_id = (select auth.uid()) or (select public.mi_rol()) in ('administracion', 'administradora', 'director'))
  );

drop policy "selecciones_comida: lectura propia, de Administración o del Director" on public.selecciones_comida;
create policy "selecciones_comida: lectura propia, de Administración o del Director"
  on public.selecciones_comida for select
  to authenticated
  using (
    (select public.soy_activo())
    and (usuario_id = (select auth.uid()) or (select public.mi_rol()) in ('administracion', 'administradora', 'director'))
  );

drop policy "notas_dieta: lectura propia, del Director o de Administración" on public.notas_dieta;
create policy "notas_dieta: lectura propia, del Director o de Administración"
  on public.notas_dieta for select to authenticated
  using (
    (select public.mi_rol()) = 'director'
    or (usuario_id = (select auth.uid()) and (select public.mi_rol()) = 'residente')
    or ((select public.mi_rol()) in ('administracion', 'administradora') and exists (
      select 1 from public.perfiles p
       where p.id = notas_dieta.usuario_id and p.activo
         and p.rol in ('director', 'residente') and not p.fuera_de_conteos
    ))
  );

drop policy "mensajes: lectura según estado y visibilidad" on public.mensajes;
create policy "mensajes: lectura según estado y visibilidad"
  on public.mensajes for select to authenticated
  using (
    (select public.soy_activo())
    and (estado = 'aprobado' or autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
    and (
      (padre_id is not null and public.puedo_leer_mensaje(padre_id))
      or (
        padre_id is null
        and (not solo_director or autor_id = (select auth.uid()) or (select public.mi_rol()) in ('director', 'administracion', 'administradora'))
      )
    )
  );
