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
