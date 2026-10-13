-- =========================================================
-- Calendario: Administración ve también el título de los eventos que le piden algo.
--
-- eventos_para_cocina() devuelve además `titulo`. Sigue devolviendo solo los eventos con pedido (lo que
-- la cocina debe preparar), con fecha, hora, categoría y pedido; nunca la serie ni quién lo creó.
-- Se suelta primero: create or replace no permite cambiar las columnas de un RETURNS TABLE.
-- =========================================================

drop function public.eventos_para_cocina(date, date);

create function public.eventos_para_cocina(p_desde date, p_hasta date)
returns table (
  id uuid,
  titulo text,
  fecha date,
  hora time,
  tipo public.tipo_evento,
  requiere_cocina public.requerimiento_cocina[],
  requiere_otro_texto text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.titulo, e.fecha, e.hora, e.tipo, e.requiere_cocina, e.requiere_otro_texto
  from public.eventos e
  where (select public.soy_activo())
    and e.fecha between p_desde and p_hasta
    and (cardinality(e.requiere_cocina) > 0 or e.requiere_otro_texto is not null)
  order by e.fecha, e.hora nulls first, e.id
$$;

revoke execute on function public.eventos_para_cocina(date, date) from public, anon;
grant execute on function public.eventos_para_cocina(date, date) to authenticated, service_role;
