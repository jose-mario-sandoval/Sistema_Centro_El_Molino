-- =========================================================
-- Pista 02-A: Comidas (esquema)
-- Spec §3.2 (plan_semanal, selecciones_comida, comidas_cerradas), §3.3, §5.2, §6.1–6.4, §8.3
-- Contrato con 02-B y 06-B: índice §4. No renombrar tablas ni funciones.
-- =========================================================

-- ---------- Nota según el estado (spec §3.3) ----------
-- temprano/tarde: hora HH:MM de 24 h; enfermo: texto no vacío de hasta 200 caracteres; resto: sin nota.
create or replace function public.nota_valida(p_estado public.estado_comida, p_nota text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_estado in ('temprano', 'tarde')
      then coalesce(p_nota ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$', false)
    when p_estado = 'enfermo'
      then coalesce(btrim(p_nota) <> '' and length(p_nota) <= 200, false)
    else p_nota is null
  end
$$;

-- ---------- Plan semanal ----------
create table public.plan_semanal (
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  comida public.tiempo_comida not null,
  estado public.estado_comida not null,
  nota text,
  primary key (usuario_id, dia_semana, comida),
  constraint plan_semanal_nota_valida check (public.nota_valida(estado, nota))
);

comment on table public.plan_semanal is
  'Patrón habitual por persona (1 = lunes … 7 = domingo). Sin fila = "Sin definir" en el plan.';

-- ---------- Selecciones (excepciones y valores congelados) ----------
create table public.selecciones_comida (
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  fecha date not null,
  comida public.tiempo_comida not null,
  estado public.estado_comida not null,
  nota text,
  origen public.origen_seleccion not null,
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, fecha, comida),
  constraint selecciones_comida_nota_valida check (public.nota_valida(estado, nota))
);

comment on table public.selecciones_comida is
  'origen = persona: excepción elegida; origen = plan: plan congelado al cerrar la comida (spec §6.3).';

create index selecciones_comida_fecha_comida_idx on public.selecciones_comida (fecha, comida);

-- Lo que escribe una persona con su sesión siempre es una excepción propia: "plan" queda
-- reservado para el congelado de cerrar_comidas_vencidas (pg_cron) y el servidor con la llave
-- secreta. También se fija actualizado_en para que no se pueda falsear desde el cliente.
create or replace function public.selecciones_comida_forzar_origen()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    new.origen := 'persona';
    new.actualizado_en := now();
  end if;
  return new;
end;
$$;

create trigger selecciones_comida_forzar_origen
  before insert or update on public.selecciones_comida
  for each row execute function public.selecciones_comida_forzar_origen();

-- ---------- Cierre definitivo ----------
create table public.comidas_cerradas (
  fecha date not null,
  comida public.tiempo_comida not null,
  cerrada_en timestamptz not null default now(),
  primary key (fecha, comida)
);

comment on table public.comidas_cerradas is
  'Una fila por comida cerrada. Solo la escribe cerrar_comidas_vencidas (o el servidor con la llave secreta).';

-- ---------- ¿Se puede editar la comida? (spec §6.1) ----------
-- 1) fecha entre el lunes de la semana actual y el domingo de la siguiente (hora local);
-- 2) p_ahora anterior al cierre calculado con horas_limite;
-- 3) sin fila en comidas_cerradas.
create or replace function public.comida_editable(
  p_fecha date,
  p_comida public.tiempo_comida,
  p_ahora timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with hoy as (
    select (p_ahora at time zone public.zona_horaria_app())::date as fecha
  ),
  semana as (
    select h.fecha - (extract(isodow from h.fecha)::int - 1) as lunes
    from hoy h
  )
  select
    p_fecha between s.lunes and s.lunes + 13
    and exists (
      select 1
      from public.horas_limite hl
      where hl.comida = p_comida
        and p_ahora < ((p_fecha + hl.dia_relativo) + hl.hora) at time zone public.zona_horaria_app()
    )
    and not exists (
      select 1
      from public.comidas_cerradas c
      where c.fecha = p_fecha and c.comida = p_comida
    )
  from semana s
$$;

revoke execute on function public.comida_editable(date, public.tiempo_comida, timestamptz) from public, anon;
grant execute on function public.comida_editable(date, public.tiempo_comida, timestamptz) to authenticated, service_role;

-- ---------- RLS: plan_semanal ----------
alter table public.plan_semanal enable row level security;

grant select, insert, update, delete on table public.plan_semanal to authenticated;
grant select, insert, update, delete on table public.plan_semanal to service_role;

create policy "plan_semanal: lectura propia o de Administración"
  on public.plan_semanal for select
  to authenticated
  using (
    (select public.soy_activo())
    and (usuario_id = (select auth.uid()) or (select public.mi_rol()) = 'administracion')
  );

create policy "plan_semanal: la persona crea su plan"
  on public.plan_semanal for insert
  to authenticated
  with check (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
  );

create policy "plan_semanal: la persona edita su plan"
  on public.plan_semanal for update
  to authenticated
  using (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
  )
  with check (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
  );

create policy "plan_semanal: la persona borra su plan"
  on public.plan_semanal for delete
  to authenticated
  using (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
  );

-- ---------- RLS: selecciones_comida ----------
alter table public.selecciones_comida enable row level security;

grant select, insert, update, delete on table public.selecciones_comida to authenticated;
grant select, insert, update, delete on table public.selecciones_comida to service_role;

create policy "selecciones_comida: lectura propia o de Administración"
  on public.selecciones_comida for select
  to authenticated
  using (
    (select public.soy_activo())
    and (usuario_id = (select auth.uid()) or (select public.mi_rol()) = 'administracion')
  );

-- comida_editable depende de la fila: no se envuelve en (select …).
create policy "selecciones_comida: la persona crea en comidas abiertas"
  on public.selecciones_comida for insert
  to authenticated
  with check (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
    and public.comida_editable(fecha, comida)
  );

create policy "selecciones_comida: la persona edita en comidas abiertas"
  on public.selecciones_comida for update
  to authenticated
  using (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
    and public.comida_editable(fecha, comida)
  )
  with check (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
    and public.comida_editable(fecha, comida)
  );

create policy "selecciones_comida: la persona borra en comidas abiertas"
  on public.selecciones_comida for delete
  to authenticated
  using (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
    and public.comida_editable(fecha, comida)
  );

-- ---------- RLS: comidas_cerradas ----------
alter table public.comidas_cerradas enable row level security;

grant select on table public.comidas_cerradas to authenticated;
grant select, insert, update, delete on table public.comidas_cerradas to service_role;
-- Nadie escribe con su sesión (spec §5.2): ni políticas ni privilegios.
revoke insert, update, delete on table public.comidas_cerradas from anon, authenticated;

create policy "comidas_cerradas: lectura para usuarios activos"
  on public.comidas_cerradas for select
  to authenticated
  using ((select public.soy_activo()));

-- ---------- Guardar una selección (spec §6.4) ----------
-- security invoker: RLS sigue aplicando. La función solo agrega errores con código propio.
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
  v_plan_estado public.estado_comida;
  v_plan_nota text;
  v_hay_plan boolean;
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

  select p.estado, p.nota
    into v_plan_estado, v_plan_nota
    from public.plan_semanal p
   where p.usuario_id = v_usuario
     and p.dia_semana = extract(isodow from p_fecha)::smallint
     and p.comida = p_comida;
  v_hay_plan := found;

  if v_hay_plan and v_plan_estado = p_estado and v_plan_nota is not distinct from v_nota then
    -- Igual al plan: no hace falta excepción.
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

-- ---------- Volver al plan (spec §6.4) ----------
create or replace function public.volver_a_plan(p_fecha date, p_comida public.tiempo_comida)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rol public.rol := public.mi_rol();
begin
  if v_rol is null or v_rol not in ('director', 'residente') then
    raise exception 'Solo Directores y Residentes eligen sus comidas'
      using errcode = '42501';
  end if;

  if not public.comida_editable(p_fecha, p_comida) then
    raise exception 'La comida % del % ya cerró o está fuera de la semana editable', p_comida, p_fecha
      using errcode = 'MOL01';
  end if;

  delete from public.selecciones_comida s
   where s.usuario_id = auth.uid()
     and s.fecha = p_fecha
     and s.comida = p_comida
     and s.origen = 'persona';
end;
$$;

revoke execute on function public.guardar_seleccion(date, public.tiempo_comida, public.estado_comida, text) from public, anon;
revoke execute on function public.volver_a_plan(date, public.tiempo_comida) from public, anon;
grant execute on function public.guardar_seleccion(date, public.tiempo_comida, public.estado_comida, text) to authenticated;
grant execute on function public.volver_a_plan(date, public.tiempo_comida) to authenticated;

-- ---------- Congelado al cerrar (spec §6.3) ----------
-- Restricciones para que COMMIT funcione: sin security definer, sin cláusula SET,
-- nombres con esquema, y el job de pg_cron ejecuta solo el CALL.
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
    -- Directores/Residentes activos sin fila y con plan para ese día y comida.
    insert into public.selecciones_comida (usuario_id, fecha, comida, estado, nota, origen)
    select p.usuario_id, v_vencida.fecha, v_vencida.comida, p.estado, p.nota, 'plan'::public.origen_seleccion
      from public.plan_semanal p
      join public.perfiles pf on pf.id = p.usuario_id
     where pf.activo
       and pf.rol in ('director', 'residente')
       and p.dia_semana = extract(isodow from v_vencida.fecha)::smallint
       and p.comida = v_vencida.comida
    on conflict (usuario_id, fecha, comida) do nothing;

    insert into public.comidas_cerradas (fecha, comida)
    values (v_vencida.fecha, v_vencida.comida)
    on conflict (fecha, comida) do nothing;

    commit;
  end loop;
end;
$$;

-- Nadie debe poder ejecutarlo desde la API; solo pg_cron (que corre como postgres,
-- a quien esta revocación no afecta) o una conexión directa con privilegios.
revoke execute on procedure public.cerrar_comidas_vencidas(timestamptz) from public, anon, authenticated;

-- ---------- Job de pg_cron cada 5 minutos (spec §8.3) ----------
-- La pista 06-A también habilita pg_cron; "if not exists" evita depender del orden de las migraciones.
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cerrar-comidas-vencidas') then
    perform cron.unschedule('cerrar-comidas-vencidas');
  end if;
end;
$$;

-- Solo el CALL en el comando: si hubiera otras sentencias, el COMMIT del procedimiento fallaría.
select cron.schedule(
  'cerrar-comidas-vencidas',
  '*/5 * * * *',
  'CALL public.cerrar_comidas_vencidas()'
);

-- ---------- Recordatorios: quién tiene la comida "Sin definir" (spec §6.2, §8.2; índice §4) ----------
-- Directores/Residentes activos sin fila en selecciones_comida y, además,
-- sin plan para ese día y comida, o con la comida ya cerrada (el plan deja de contar).
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

revoke execute on function public.comidas_sin_definir(date, public.tiempo_comida) from public, anon, authenticated;
grant execute on function public.comidas_sin_definir(date, public.tiempo_comida) to service_role;
