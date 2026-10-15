-- =========================================================
-- Comidas: desde hoy hasta tres meses calendario, ambos incluidos.
-- Las políticas RLS y las RPC (propias y del Director) ya delegan en
-- comida_editable(): el nuevo período rige para todas esas escrituras.
-- =========================================================

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
  )
  select
    -- PostgreSQL suma meses calendario y ajusta al último día cuando el
    -- día equivalente no existe en el mes de destino (p. ej., 31/01 → 30/04).
    p_fecha between h.fecha and (h.fecha + interval '3 months')::date
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
  from hoy h
$$;

comment on function public.comida_editable(date, public.tiempo_comida, timestamptz) is
  'Desde hoy hasta hoy + tres meses calendario, ambos incluidos, según la zona horaria del proyecto; mantiene horas límite y comidas cerradas. El parámetro temporal permite verificar reglas con fechas fijas; las escrituras usan now() del servidor.';

-- CREATE OR REPLACE conserva los permisos vigentes de la función.
