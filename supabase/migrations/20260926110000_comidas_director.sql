-- =========================================================
-- "La casa" del Director (1/2): el Director gestiona las comidas de las demás personas.
--
-- Reglas acordadas (spec 2026-09-26 §5):
--   - El Director ve y cambia, de cualquier persona activa con comidas (Director o Residente),
--     su semana, su plan semanal y sus ausencias. Administración nunca.
--   - Con los MISMOS cierres que todos: todo sigue pasando por security invoker + RLS, así que
--     comida_editable() y el congelado aplican igual. Lo cerrado no se cambia.
--   - La persona ve quién cambió: modificado_por / creado_por, llenados por trigger (nunca por el
--     cliente) con nullif(auth.uid(), usuario_id). null = la propia persona, el congelado o el
--     servidor con la llave secreta.
--   - Consecuencia: el Director pasa a LEER las ausencias de todos. Administración sigue sin
--     leerlas (solo ausentes_en()).
--   - De paso se cierra un hueco que ya existía: editar plan_semanal entre la hora límite de una
--     comida y el job de cierre (hasta 5 minutos) cambiaba una comida que la cocina ya contó.
-- =========================================================

-- ---------- ¿Quién puede gestionar las comidas de quién? ----------
-- Activa y con comidas (Director o Residente). Solo la usa puedo_gestionar_comidas_de().
create function public.tiene_comidas(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.perfiles p
     where p.id = p_usuario
       and p.activo
       and p.rol in ('director', 'residente')
  )
$$;

-- Uno mismo si es Director o Residente; otra persona solo si quien llama es Director y la otra
-- tiene comidas. mi_rol() es null con la cuenta inactiva o sin sesión: coalesce → false.
create function public.puedo_gestionar_comidas_de(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case
      when p_usuario = (select auth.uid()) then public.mi_rol() in ('director', 'residente')
      else public.mi_rol() = 'director' and public.tiene_comidas(p_usuario)
    end,
    false
  )
$$;

revoke execute on function public.tiene_comidas(uuid) from public, anon, authenticated;
grant execute on function public.tiene_comidas(uuid) to service_role;
-- Las políticas la evalúan con los privilegios de quien consulta: authenticated la necesita.
revoke execute on function public.puedo_gestionar_comidas_de(uuid) from public, anon;
grant execute on function public.puedo_gestionar_comidas_de(uuid) to authenticated, service_role;

-- ---------- Quién cambió ----------
alter table public.selecciones_comida
  add column modificado_por uuid references public.perfiles (id) on delete set null;
alter table public.plan_semanal
  add column modificado_por uuid references public.perfiles (id) on delete set null;
alter table public.ausencias
  add column creado_por uuid references public.perfiles (id) on delete set null;

comment on column public.selecciones_comida.modificado_por is
  'Quién la cambió, si no fue la propia persona (el Director). null = la persona, el congelado o el servidor.';
comment on column public.plan_semanal.modificado_por is
  'Quién cambió esta celda del plan, si no fue la propia persona (el Director).';
comment on column public.ausencias.creado_por is
  'Quién marcó la ausencia, si no fue la propia persona (el Director).';

-- Sin security definer a propósito: tiene que ver current_user = 'authenticated'. Dentro del
-- congelado (security definer, corre como el dueño) no toca nada: origen "plan"/"ausencia" y
-- modificado_por null.
create or replace function public.selecciones_comida_forzar_origen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.origen := 'persona';
    new.actualizado_en := now();
    new.modificado_por := nullif((select auth.uid()), new.usuario_id);
  end if;
  return new;
end;
$$;

create function public.plan_semanal_quien_modifica()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.modificado_por := nullif((select auth.uid()), new.usuario_id);
  end if;
  return new;
end;
$$;

create trigger plan_semanal_quien_modifica
  before insert or update on public.plan_semanal
  for each row execute function public.plan_semanal_quien_modifica();

create function public.ausencias_quien_crea()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.creado_por := nullif((select auth.uid()), new.usuario_id);
  end if;
  return new;
end;
$$;

create trigger ausencias_quien_crea
  before insert on public.ausencias
  for each row execute function public.ausencias_quien_crea();

revoke execute on function public.plan_semanal_quien_modifica() from public, anon, authenticated;
revoke execute on function public.ausencias_quien_crea() from public, anon, authenticated;

-- ---------- Congelado: solo lo no cerrado, y opcionalmente una sola celda del plan ----------
-- Dos cambios sobre la versión de ausencias:
--   1) No toca comidas ya cerradas (comidas_cerradas): el job ya las congeló, y quien quedó sin
--      fila quedó "Sin definir" para siempre. Antes, quitar una ausencia (o, ahora, editar un plan)
--      le escribía un valor a una comida cerrada "Sin definir".
--   2) p_dia_semana / p_comida opcionales: el trigger del plan congela solo la celda que cambia.
-- Límite conocido (igual que antes): una comida vencida, sin congelar y "Sin definir" no se puede
-- congelar como tal (ninguna fila representa "Sin definir"); si en esos minutos la persona crea el
-- plan o la ausencia de esa comida, el job la congela con el valor nuevo.
-- Se reemplaza (drop + create) en vez de sumar una sobrecarga: con las dos, la llamada de 3
-- argumentos del trigger de ausencias sería ambigua.
drop function public.congelar_comidas_de(uuid, date, date);

create function public.congelar_comidas_de(
  p_usuario uuid,
  p_desde date,
  p_hasta date,
  p_dia_semana smallint default null,
  p_comida public.tiempo_comida default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_zona text := public.zona_horaria_app();
  v_ahora timestamptz := now();
  v_hoy date := (v_ahora at time zone v_zona)::date;
  -- El job de cierre mira la última semana; antes de eso todo ya está congelado.
  v_desde date := greatest(p_desde, v_hoy - 7);
  -- Ninguna comida posterior a mañana puede haber vencido (el desayuno de mañana cierra hoy).
  v_hasta date := least(p_hasta, v_hoy + 1);
begin
  -- Solo personas activas con comidas. También cubre el borrado en cascada de una cuenta: el perfil
  -- ya no existe y no hay nada que congelar (insertar violaría la clave foránea).
  if not public.tiene_comidas(p_usuario) then
    return;
  end if;
  if v_hasta < v_desde then
    return;
  end if;

  insert into public.selecciones_comida (usuario_id, fecha, comida, estado, nota, origen)
  select p_usuario,
         d.fecha,
         hl.comida,
         case when aus.ausente then 'no'::public.estado_comida else pl.estado end,
         case when aus.ausente then null else pl.nota end,
         case when aus.ausente then 'ausencia'::public.origen_seleccion else 'plan'::public.origen_seleccion end
    from (
      select v_desde + g.n as fecha
        from pg_catalog.generate_series(0, v_hasta - v_desde) as g(n)
    ) d
   cross join public.horas_limite hl
    left join public.plan_semanal pl
      on pl.usuario_id = p_usuario
     and pl.dia_semana = extract(isodow from d.fecha)::smallint
     and pl.comida = hl.comida
   cross join lateral (
     select exists (
       select 1 from public.ausencias a
        where a.usuario_id = p_usuario and d.fecha between a.desde and a.hasta
     ) as ausente
   ) aus
   where ((d.fecha + hl.dia_relativo) + hl.hora) at time zone v_zona <= v_ahora
     and (p_dia_semana is null or extract(isodow from d.fecha)::smallint = p_dia_semana)
     and (p_comida is null or hl.comida = p_comida)
     and not exists (
       select 1 from public.comidas_cerradas c
        where c.fecha = d.fecha and c.comida = hl.comida
     )
     and (aus.ausente or pl.usuario_id is not null)
  on conflict (usuario_id, fecha, comida) do nothing;
end;
$$;

revoke execute on function public.congelar_comidas_de(uuid, date, date, smallint, public.tiempo_comida)
  from public, anon, authenticated;

-- Justo ANTES de cambiar una celda del plan se congela lo ya vencido de esa celda (ese día de la
-- semana y esa comida) con lo que valía. Solo la celda: cargar un plan fila por fila no congela
-- nada (cada fila nueva no tenía plan) y cambiar el lunes no toca el martes. En un upsert se
-- dispara el BEFORE INSERT con la fila vieja todavía en su lugar: también congela a tiempo.
-- security definer: escribe como el dueño (con authenticated, el origen se forzaría a "persona").
create function public.plan_semanal_congelar_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hoy date := (now() at time zone public.zona_horaria_app())::date;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.congelar_comidas_de(old.usuario_id, v_hoy - 7, v_hoy + 1, old.dia_semana, old.comida);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.congelar_comidas_de(new.usuario_id, v_hoy - 7, v_hoy + 1, new.dia_semana, new.comida);
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger plan_semanal_congelar_antes
  before insert or update or delete on public.plan_semanal
  for each row execute function public.plan_semanal_congelar_antes();

revoke execute on function public.plan_semanal_congelar_antes() from public, anon, authenticated;

-- ---------- RLS: plan_semanal ----------
drop policy "plan_semanal: lectura propia o de Administración" on public.plan_semanal;
drop policy "plan_semanal: la persona crea su plan" on public.plan_semanal;
drop policy "plan_semanal: la persona edita su plan" on public.plan_semanal;
drop policy "plan_semanal: la persona borra su plan" on public.plan_semanal;

create policy "plan_semanal: lectura propia, de Administración o del Director"
  on public.plan_semanal for select
  to authenticated
  using (
    (select public.soy_activo())
    and (usuario_id = (select auth.uid()) or (select public.mi_rol()) in ('administracion', 'director'))
  );

-- puedo_gestionar_comidas_de depende de la fila: no se envuelve en (select …).
create policy "plan_semanal: la persona o el Director crean"
  on public.plan_semanal for insert
  to authenticated
  with check ((select public.soy_activo()) and public.puedo_gestionar_comidas_de(usuario_id));

create policy "plan_semanal: la persona o el Director editan"
  on public.plan_semanal for update
  to authenticated
  using ((select public.soy_activo()) and public.puedo_gestionar_comidas_de(usuario_id))
  with check ((select public.soy_activo()) and public.puedo_gestionar_comidas_de(usuario_id));

create policy "plan_semanal: la persona o el Director borran"
  on public.plan_semanal for delete
  to authenticated
  using ((select public.soy_activo()) and public.puedo_gestionar_comidas_de(usuario_id));

-- ---------- RLS: selecciones_comida ----------
drop policy "selecciones_comida: lectura propia o de Administración" on public.selecciones_comida;
drop policy "selecciones_comida: la persona crea en comidas abiertas" on public.selecciones_comida;
drop policy "selecciones_comida: la persona edita en comidas abiertas" on public.selecciones_comida;
drop policy "selecciones_comida: la persona borra en comidas abiertas" on public.selecciones_comida;

create policy "selecciones_comida: lectura propia, de Administración o del Director"
  on public.selecciones_comida for select
  to authenticated
  using (
    (select public.soy_activo())
    and (usuario_id = (select auth.uid()) or (select public.mi_rol()) in ('administracion', 'director'))
  );

create policy "selecciones_comida: la persona o el Director crean en comidas abiertas"
  on public.selecciones_comida for insert
  to authenticated
  with check (
    (select public.soy_activo())
    and public.puedo_gestionar_comidas_de(usuario_id)
    and public.comida_editable(fecha, comida)
  );

create policy "selecciones_comida: la persona o el Director editan en comidas abiertas"
  on public.selecciones_comida for update
  to authenticated
  using (
    (select public.soy_activo())
    and public.puedo_gestionar_comidas_de(usuario_id)
    and public.comida_editable(fecha, comida)
  )
  with check (
    (select public.soy_activo())
    and public.puedo_gestionar_comidas_de(usuario_id)
    and public.comida_editable(fecha, comida)
  );

create policy "selecciones_comida: la persona o el Director borran en comidas abiertas"
  on public.selecciones_comida for delete
  to authenticated
  using (
    (select public.soy_activo())
    and public.puedo_gestionar_comidas_de(usuario_id)
    and public.comida_editable(fecha, comida)
  );

-- ---------- RLS: ausencias ----------
drop policy "ausencias: lectura propia" on public.ausencias;
drop policy "ausencias: cada persona registra las suyas" on public.ausencias;
drop policy "ausencias: cada persona quita las suyas" on public.ausencias;

-- mi_rol() es null con la cuenta inactiva: entonces no lee ni escribe nada.
create policy "ausencias: lectura de su dueña o del Director"
  on public.ausencias for select
  to authenticated
  using (
    (usuario_id = (select auth.uid()) and (select public.mi_rol()) in ('director', 'residente'))
    or (select public.mi_rol()) = 'director'
  );

-- Que ya haya pasado todo el rango no tiene sentido: no se puede registrar una ausencia completamente pasada.
create policy "ausencias: la persona o el Director registran"
  on public.ausencias for insert
  to authenticated
  with check (
    public.puedo_gestionar_comidas_de(usuario_id)
    and hasta >= (select (now() at time zone public.zona_horaria_app())::date)
  );

create policy "ausencias: la persona o el Director quitan"
  on public.ausencias for delete
  to authenticated
  using (public.puedo_gestionar_comidas_de(usuario_id));

comment on table public.ausencias is
  'Días en que una persona no estará en la casa. Sus comidas de esos días quedan en "No comer". Las ve y gestiona su dueña y el Director; Administración solo ve el efecto.';

-- ---------- Guardar una selección de cualquier persona que se pueda gestionar ----------
-- Mismo cuerpo que guardar_seleccion (20260921180100_ausencias.sql) con p_usuario en lugar de
-- auth.uid(). security invoker: RLS sigue aplicando (el Director lee plan y ausencias ajenas por
-- sus políticas de lectura, y escribe solo comidas abiertas).
create function public.guardar_seleccion_de(
  p_usuario uuid,
  p_fecha date,
  p_comida public.tiempo_comida,
  p_estado public.estado_comida,
  p_nota text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nota text := nullif(btrim(p_nota), '');
  v_base_estado public.estado_comida;
  v_base_nota text;
  v_hay_base boolean;
  v_ausente boolean;
begin
  if not public.puedo_gestionar_comidas_de(p_usuario) then
    if p_usuario is not distinct from (select auth.uid()) then
      raise exception 'Solo Directores y Residentes eligen sus comidas'
        using errcode = '42501';
    end if;
    raise exception 'Solo el Director elige las comidas de otra persona, y solo de quien come en la casa'
      using errcode = '42501';
  end if;

  if not public.comida_editable(p_fecha, p_comida) then
    raise exception 'La comida % del % ya cerró o está fuera de la semana editable', p_comida, p_fecha
      using errcode = 'MOL01';
  end if;

  if not public.nota_valida(p_estado, v_nota) then
    raise exception 'Nota inválida para el estado %', p_estado
      using errcode = 'MOL04';
  end if;

  select exists (
    select 1 from public.ausencias a
     where a.usuario_id = p_usuario and p_fecha between a.desde and a.hasta
  ) into v_ausente;

  if v_ausente then
    v_base_estado := 'no';
    v_base_nota := null;
    v_hay_base := true;
  else
    select p.estado, p.nota
      into v_base_estado, v_base_nota
      from public.plan_semanal p
     where p.usuario_id = p_usuario
       and p.dia_semana = extract(isodow from p_fecha)::smallint
       and p.comida = p_comida;
    v_hay_base := found;
  end if;

  if v_hay_base and v_base_estado = p_estado and v_base_nota is not distinct from v_nota then
    -- Igual a la referencia (el plan, o "No comer" si está ausente): no hace falta excepción.
    delete from public.selecciones_comida s
     where s.usuario_id = p_usuario
       and s.fecha = p_fecha
       and s.comida = p_comida;
  else
    insert into public.selecciones_comida (usuario_id, fecha, comida, estado, nota, origen)
    values (p_usuario, p_fecha, p_comida, p_estado, v_nota, 'persona')
    on conflict (usuario_id, fecha, comida) do update
      set estado = excluded.estado,
          nota = excluded.nota,
          origen = 'persona',
          actualizado_en = now();
  end if;
end;
$$;

create function public.volver_a_plan_de(p_usuario uuid, p_fecha date, p_comida public.tiempo_comida)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not public.puedo_gestionar_comidas_de(p_usuario) then
    if p_usuario is not distinct from (select auth.uid()) then
      raise exception 'Solo Directores y Residentes eligen sus comidas'
        using errcode = '42501';
    end if;
    raise exception 'Solo el Director elige las comidas de otra persona, y solo de quien come en la casa'
      using errcode = '42501';
  end if;

  if not public.comida_editable(p_fecha, p_comida) then
    raise exception 'La comida % del % ya cerró o está fuera de la semana editable', p_comida, p_fecha
      using errcode = 'MOL01';
  end if;

  delete from public.selecciones_comida s
   where s.usuario_id = p_usuario
     and s.fecha = p_fecha
     and s.comida = p_comida
     and s.origen = 'persona';
end;
$$;

-- Las de siempre: la propia persona. Mismos códigos de error que antes.
create or replace function public.guardar_seleccion(
  p_fecha date,
  p_comida public.tiempo_comida,
  p_estado public.estado_comida,
  p_nota text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.guardar_seleccion_de((select auth.uid()), p_fecha, p_comida, p_estado, p_nota);
end;
$$;

create or replace function public.volver_a_plan(p_fecha date, p_comida public.tiempo_comida)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.volver_a_plan_de((select auth.uid()), p_fecha, p_comida);
end;
$$;

revoke execute on function public.guardar_seleccion_de(uuid, date, public.tiempo_comida, public.estado_comida, text) from public, anon;
revoke execute on function public.volver_a_plan_de(uuid, date, public.tiempo_comida) from public, anon;
grant execute on function public.guardar_seleccion_de(uuid, date, public.tiempo_comida, public.estado_comida, text) to authenticated;
grant execute on function public.volver_a_plan_de(uuid, date, public.tiempo_comida) to authenticated;
