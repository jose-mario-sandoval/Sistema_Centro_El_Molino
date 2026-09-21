-- =========================================================
-- Ausencias (2/2): días en que una persona no está en la casa.
--
-- Cada Director o Residente marca sus ausencias (un rango de días) y
-- sus comidas de esos días se cancelan solas. Reglas acordadas:
--   - El valor efectivo de una comida pasa a ser:
--       selección de la persona -> ausencia -> plan -> "Sin definir".
--     Ausencia = "No comer". La persona puede reactivar una comida
--     puntual (una selección suya gana sobre la ausencia).
--   - Al quitar la ausencia vuelve a regir el plan semanal.
--   - Las comidas que ya cerraron NO se tocan: la cocina ya contó
--     con ellas. Ver congelar_comidas_de().
--   - Las ausencias son privadas: la cocina ve el efecto ("No comer"),
--     no el motivo ni las fechas.
-- =========================================================

create table public.ausencias (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  desde date not null check (desde between '2000-01-01' and '2099-12-31'),
  hasta date not null check (hasta between '2000-01-01' and '2099-12-31'),
  creado_en timestamptz not null default now(),
  constraint ausencias_rango_valido check (hasta >= desde and hasta - desde <= 365)
);

comment on table public.ausencias is
  'Días en que una persona no estará en la casa. Sus comidas de esos días quedan en "No comer". Privadas: solo las ve su dueña.';

create index ausencias_usuario_idx on public.ausencias (usuario_id, desde, hasta);

-- ---------- RLS ----------
alter table public.ausencias enable row level security;

-- Permisos explícitos (índice §3.4). Sin UPDATE: para cambiar un rango se quita y se vuelve a marcar.
revoke all on table public.ausencias from anon;
grant select, insert, delete on table public.ausencias to authenticated;
grant select, insert, update, delete on table public.ausencias to service_role;

-- mi_rol() devuelve null si la cuenta está inactiva: entonces no lee ni escribe nada.
create policy "ausencias: lectura propia"
  on public.ausencias for select
  to authenticated
  using (
    usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
  );

-- Que ya haya pasado todo el rango no tiene sentido: no se puede registrar una ausencia completamente pasada.
create policy "ausencias: cada persona registra las suyas"
  on public.ausencias for insert
  to authenticated
  with check (
    usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
    and hasta >= (now() at time zone public.zona_horaria_app())::date
  );

create policy "ausencias: cada persona quita las suyas"
  on public.ausencias for delete
  to authenticated
  using (
    usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
  );

-- ---------- Congelar lo que ya cerró, antes de tocar una ausencia ----------
-- Entre que pasa la hora límite y el job de pg_cron congela la comida (hasta 5 minutos), agregar o
-- quitar una ausencia cambiaría lo que la cocina ya contó. Para que "después del cierre no cambia
-- nada" siga siendo verdad, justo ANTES de agregar o quitar una ausencia se congelan las comidas
-- vencidas de ese rango con el valor que tenían en ese momento (ausencia o plan).
-- security definer: escribe como el dueño, no como `authenticated` (que forzaría origen = persona).
create or replace function public.congelar_comidas_de(p_usuario uuid, p_desde date, p_hasta date)
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
  if not exists (
    select 1 from public.perfiles pf
     where pf.id = p_usuario and pf.activo and pf.rol in ('director', 'residente')
  ) then
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
     and (aus.ausente or pl.usuario_id is not null)
  on conflict (usuario_id, fecha, comida) do nothing;
end;
$$;

create or replace function public.ausencias_congelar_antes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.congelar_comidas_de(new.usuario_id, new.desde, new.hasta);
    return new;
  end if;
  perform public.congelar_comidas_de(old.usuario_id, old.desde, old.hasta);
  return old;
end;
$$;

create trigger ausencias_congelar_antes
  before insert or delete on public.ausencias
  for each row execute function public.ausencias_congelar_antes();

-- Nadie las llama desde la API: solo el trigger, que corre como dueño.
revoke execute on function public.congelar_comidas_de(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.ausencias_congelar_antes() from public, anon, authenticated;

-- ---------- Guardar una selección: la referencia durante una ausencia es "No comer" ----------
-- Antes se comparaba con el plan para decidir si hacía falta una excepción. Si la persona está
-- ausente ese día, la referencia es "No comer": elegir "No comer" no es una excepción, y elegir
-- cualquier otra cosa sí (reactiva la comida).
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
declare
  v_usuario uuid := auth.uid();
  v_rol public.rol := public.mi_rol();
  v_nota text := nullif(btrim(p_nota), '');
  v_base_estado public.estado_comida;
  v_base_nota text;
  v_hay_base boolean;
  v_ausente boolean;
begin
  -- mi_rol() es null si la cuenta está inactiva.
  if v_rol is null or v_rol not in ('director', 'residente') then
    raise exception 'Solo Directores y Residentes eligen sus comidas'
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
     where a.usuario_id = v_usuario and p_fecha between a.desde and a.hasta
  ) into v_ausente;

  if v_ausente then
    v_base_estado := 'no';
    v_base_nota := null;
    v_hay_base := true;
  else
    select p.estado, p.nota
      into v_base_estado, v_base_nota
      from public.plan_semanal p
     where p.usuario_id = v_usuario
       and p.dia_semana = extract(isodow from p_fecha)::smallint
       and p.comida = p_comida;
    v_hay_base := found;
  end if;

  if v_hay_base and v_base_estado = p_estado and v_base_nota is not distinct from v_nota then
    -- Igual a la referencia (el plan, o "No comer" si está ausente): no hace falta excepción.
    delete from public.selecciones_comida s
     where s.usuario_id = v_usuario
       and s.fecha = p_fecha
       and s.comida = p_comida;
  else
    insert into public.selecciones_comida (usuario_id, fecha, comida, estado, nota, origen)
    values (v_usuario, p_fecha, p_comida, p_estado, v_nota, 'persona')
    on conflict (usuario_id, fecha, comida) do update
      set estado = excluded.estado,
          nota = excluded.nota,
          origen = 'persona',
          actualizado_en = now();
  end if;
end;
$$;

-- ---------- Congelado al cerrar: una persona ausente se congela en "No comer" ----------
-- Igual que antes, salvo que quien está ausente ese día se congela como "No comer" (origen
-- "ausencia"), tenga o no plan. Sin cláusula SET ni security definer: el COMMIT del procedimiento
-- lo exige (ver la migración de comidas).
create or replace procedure public.cerrar_comidas_vencidas(p_ahora timestamptz default now())
language plpgsql
as $$
declare
  v_zona text := public.zona_horaria_app();
  v_hoy date := (p_ahora at time zone v_zona)::date;
  v_desde date := v_hoy - 7;
  v_hasta date := (v_hoy - (extract(isodow from v_hoy)::int - 1)) + 13;
  v_vencida record;
begin
  for v_vencida in
    select d.fecha, hl.comida
      from (
        select v_desde + g.n as fecha
          from pg_catalog.generate_series(0, v_hasta - v_desde) as g(n)
      ) d
      cross join public.horas_limite hl
     where ((d.fecha + hl.dia_relativo) + hl.hora) at time zone v_zona <= p_ahora
       and not exists (
         select 1
           from public.comidas_cerradas c
          where c.fecha = d.fecha and c.comida = hl.comida
       )
     order by d.fecha, hl.comida
  loop
    -- Directores/Residentes activos sin fila: con plan para ese día y comida, o ausentes.
    insert into public.selecciones_comida (usuario_id, fecha, comida, estado, nota, origen)
    select pf.id,
           v_vencida.fecha,
           v_vencida.comida,
           case when aus.ausente then 'no'::public.estado_comida else p.estado end,
           case when aus.ausente then null else p.nota end,
           case when aus.ausente then 'ausencia'::public.origen_seleccion else 'plan'::public.origen_seleccion end
      from public.perfiles pf
      left join public.plan_semanal p
        on p.usuario_id = pf.id
       and p.dia_semana = extract(isodow from v_vencida.fecha)::smallint
       and p.comida = v_vencida.comida
     cross join lateral (
       select exists (
         select 1 from public.ausencias a
          where a.usuario_id = pf.id and v_vencida.fecha between a.desde and a.hasta
       ) as ausente
     ) aus
     where pf.activo
       and pf.rol in ('director', 'residente')
       and (aus.ausente or p.usuario_id is not null)
    on conflict (usuario_id, fecha, comida) do nothing;

    insert into public.comidas_cerradas (fecha, comida)
    values (v_vencida.fecha, v_vencida.comida)
    on conflict (fecha, comida) do nothing;

    commit;
  end loop;
end;
$$;

-- ---------- Recordatorios: quien está ausente ya tiene su comida definida ("No comer") ----------
create or replace function public.comidas_sin_definir(p_fecha date, p_comida public.tiempo_comida)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pf.id
    from public.perfiles pf
   where pf.activo
     and pf.rol in ('director', 'residente')
     and not exists (
       select 1
         from public.selecciones_comida s
        where s.usuario_id = pf.id
          and s.fecha = p_fecha
          and s.comida = p_comida
     )
     and not exists (
       select 1
         from public.ausencias a
        where a.usuario_id = pf.id
          and p_fecha between a.desde and a.hasta
     )
     and (
       not exists (
         select 1
           from public.plan_semanal p
          where p.usuario_id = pf.id
            and p.dia_semana = extract(isodow from p_fecha)::smallint
            and p.comida = p_comida
       )
       or exists (
         select 1
           from public.comidas_cerradas c
          where c.fecha = p_fecha
            and c.comida = p_comida
       )
     )
$$;

-- ---------- Quién está ausente (solo para Administración, que arma la hoja de la cocina) ----------
-- Administración no lee la tabla: solo necesita saber quién NO come ese día, sin fechas ni motivo.
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
   where (select public.mi_rol()) = 'administracion'
     and p_fecha between a.desde and a.hasta
$$;

revoke execute on function public.ausentes_en(date) from public, anon;
grant execute on function public.ausentes_en(date) to authenticated, service_role;
