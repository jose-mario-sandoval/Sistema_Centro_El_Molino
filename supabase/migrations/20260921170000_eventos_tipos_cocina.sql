-- =========================================================
-- Calendario: tipo de evento y lo que el evento le pide a la cocina.
--
-- Administración vive en otra parte de la casa y no debe conocer
-- de qué son los eventos: solo necesita saber que en tal fecha y
-- hora la cocina debe preparar algo. Por eso deja de leer la tabla
-- `eventos` y lee únicamente `eventos_para_cocina()`, que no
-- devuelve título ni tipo.
--
-- Las columnas nuevas tienen valor por defecto: los eventos que ya
-- existen quedan como tipo 'otro' y sin pedidos a la cocina.
-- =========================================================

create type public.tipo_evento as enum ('retiro', 'charla', 'visita', 'reunion', 'otro');

-- Lo que un evento puede pedirle a la cocina. 'materiales' es "solo materiales de cocina"
-- (vajilla, mesas, termos: sin preparar comida), así que no se combina con lo demás.
create type public.requerimiento_cocina as enum ('merienda', 'comida', 'materiales');

-- Sin repetidos, sin nulos, y 'materiales' solo. Una función porque un CHECK no admite subconsultas.
create or replace function public.requiere_cocina_valido(p public.requerimiento_cocina[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p is not null
    and cardinality(p) = (select count(distinct x) from unnest(p) as x)
    and not ('materiales'::public.requerimiento_cocina = any (p) and cardinality(p) > 1)
$$;

alter table public.eventos
  add column tipo public.tipo_evento not null default 'otro',
  add column requiere_cocina public.requerimiento_cocina[] not null default '{}',
  add constraint eventos_requiere_cocina_valido check (public.requiere_cocina_valido(requiere_cocina));

comment on column public.eventos.tipo is 'Tipo de evento. Administración no lo ve.';
comment on column public.eventos.requiere_cocina is
  'Lo que el evento pide a la cocina: merienda y/o comida, o solo materiales. Vacío = nada.';

-- El Director edita las columnas nuevas (el UPDATE está concedido columna por columna).
grant update (tipo, requiere_cocina) on table public.eventos to authenticated;

-- ---------- Administración deja de leer la tabla ----------
drop policy "eventos: lectura para usuarios activos" on public.eventos;

-- mi_rol() devuelve null si la cuenta está inactiva: entonces no lee nada.
create policy "eventos: lectura para Director y Residente"
  on public.eventos for select
  to authenticated
  using ((select public.mi_rol()) in ('director', 'residente'));

-- ---------- Lo único que Administración ve de los eventos ----------
-- Solo los eventos que piden algo a la cocina, y solo fecha, hora y qué preparar. Sin título ni tipo.
create or replace function public.eventos_para_cocina(p_desde date, p_hasta date)
returns table (id uuid, fecha date, hora time, requiere_cocina public.requerimiento_cocina[])
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.fecha, e.hora, e.requiere_cocina
  from public.eventos e
  where (select public.soy_activo())
    and e.fecha between p_desde and p_hasta
    and cardinality(e.requiere_cocina) > 0
  order by e.fecha, e.hora nulls first, e.id
$$;

revoke execute on function public.eventos_para_cocina(date, date) from public, anon;
grant execute on function public.eventos_para_cocina(date, date) to authenticated, service_role;
