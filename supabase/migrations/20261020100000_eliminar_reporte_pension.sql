-- Quitar un reporte subido por error. Mismo camino que el retiro por retención: la ficha se borra y la
-- ruta pasa a la cola durable de limpieza (el archivo de Storage lo borra el servidor, y el cron lo
-- reintenta si esa ejecución se corta). Nadie escribe estas tablas directo: solo esta función.
create function public.eliminar_reporte_pension(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_categoria text; v_ruta text;
begin
  if (select public.mi_rol()) is distinct from 'administradora'::public.rol then
    raise exception 'Sólo la Administradora puede eliminar reportes' using errcode = '42501';
  end if;
  select r.categoria into v_categoria from public.pensiones_reportes r where r.id = p_id;
  -- Ya no existe (dos clics, o lo retiró la retención): no es un error.
  if not found then return; end if;
  -- El mismo candado de categoría que finalizar_reporte_pension, tomado ANTES de bloquear filas: así una
  -- carga que retira documentos viejos y esta eliminación no se esperan una a la otra (sin interbloqueo).
  perform pg_advisory_xact_lock(hashtextextended('pensiones-reportes:' || v_categoria, 0));
  delete from public.pensiones_reportes r where r.id = p_id returning r.ruta into v_ruta;
  if found then
    insert into public.pensiones_reportes_limpieza (ruta) values (v_ruta) on conflict do nothing;
  end if;
end;
$$;
revoke execute on function public.eliminar_reporte_pension(uuid) from public, anon;
grant execute on function public.eliminar_reporte_pension(uuid) to authenticated;
