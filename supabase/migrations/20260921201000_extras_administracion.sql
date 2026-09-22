-- =========================================================
-- Cenas extra de la semana para Administración: cuántas personas confirmaron
-- por día y tiempo de comida, sin nombres ni detalle de quién. Administración
-- no lee eventos ni enlaces_confirmacion ni confirmaciones_extra directo (no
-- tiene RLS para ninguna de las tres); esta función security definer es el
-- único camino.
-- =========================================================

create function public.extras_de_la_semana(p_desde date, p_hasta date)
returns table (fecha date, tiempo_comida public.tiempo_comida, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select e.fecha, l.tiempo_comida, sum(c.cantidad_personas)::integer as total
  from public.confirmaciones_extra c
  join public.enlaces_confirmacion l on l.id = c.enlace_id
  join public.eventos e on e.id = l.evento_id
  where (select public.mi_rol()) = 'administracion'
    and e.fecha between p_desde and p_hasta
  group by e.fecha, l.tiempo_comida
$$;

revoke execute on function public.extras_de_la_semana(date, date) from public, anon;
grant execute on function public.extras_de_la_semana(date, date) to authenticated, service_role;
