-- =========================================================
-- Calendario: categorías de evento (San Rafael/San Gabriel/San Miguel/Otro)
-- y pedido libre a Administración.
--
-- El enum tipo_evento se reemplaza por completo (no es un valor agregado a
-- uno existente: es un tipo nuevo con el mismo nombre). Los eventos que ya
-- existían con un tipo viejo (retiro/charla/visita/reunion) quedan como
-- 'otro' — no hay correspondencia 1 a 1 entre las categorías viejas y las
-- nuevas.
-- =========================================================

alter type public.tipo_evento rename to tipo_evento_viejo;

create type public.tipo_evento as enum ('san_rafael', 'san_gabriel', 'san_miguel', 'otro');

alter table public.eventos
  alter column tipo drop default,
  alter column tipo type public.tipo_evento using 'otro'::public.tipo_evento,
  alter column tipo set default 'otro';

drop type public.tipo_evento_viejo;

-- ---------- Pedido libre a Administración ----------
-- Independiente de requiere_cocina: se puede combinar con cualquier valor (incluido 'materiales') o
-- ir solo. Mismo patrón que el check de titulo: recortado, sin quedar en cadena vacía.
alter table public.eventos
  add column requiere_otro_texto text,
  add constraint eventos_requiere_otro_texto_valido check (
    requiere_otro_texto is null
    or (requiere_otro_texto = btrim(requiere_otro_texto) and length(requiere_otro_texto) between 1 and 200)
  );

comment on column public.eventos.requiere_otro_texto is
  'Pedido a Administración que no entra en requiere_cocina (ej. "20 sillas extra"). Administración lo ve.';

grant update (requiere_otro_texto) on table public.eventos to authenticated;

-- ---------- eventos_para_cocina(): ahora también el pedido libre ----------
-- Se suelta primero: create or replace no permite cambiar las columnas de un RETURNS TABLE.
drop function public.eventos_para_cocina(date, date);

create function public.eventos_para_cocina(p_desde date, p_hasta date)
returns table (
  id uuid,
  fecha date,
  hora time,
  requiere_cocina public.requerimiento_cocina[],
  requiere_otro_texto text
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id, e.fecha, e.hora, e.requiere_cocina, e.requiere_otro_texto
  from public.eventos e
  where (select public.soy_activo())
    and e.fecha between p_desde and p_hasta
    and (cardinality(e.requiere_cocina) > 0 or e.requiere_otro_texto is not null)
  order by e.fecha, e.hora nulls first, e.id
$$;

revoke execute on function public.eventos_para_cocina(date, date) from public, anon;
grant execute on function public.eventos_para_cocina(date, date) to authenticated, service_role;
