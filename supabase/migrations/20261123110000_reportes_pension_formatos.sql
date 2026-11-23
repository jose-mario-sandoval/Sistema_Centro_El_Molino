-- =========================================================
-- Reportes de Pensiones: además de PDF, también Excel (.xlsx, .xls) y CSV.
--
-- La Administradora a veces sube la información contable en Excel. El servidor sigue comprobando que el
-- contenido corresponda a la extensión (firma del archivo, sin macros) y que pese hasta 3 MiB; esta
-- migración solo abre lo que la base y Storage rechazaban por ser siempre PDF:
--   1. los tipos MIME que acepta el bucket privado;
--   2. la ruta del objeto, que terminaba siempre en '.pdf' y ahora lleva la extensión del archivo.
--
-- Los reportes ya subidos (todos PDF) no cambian: sus rutas siguen terminando en '.pdf'.
-- =========================================================

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv'
]
where id = 'pensiones-reportes';

-- Igual que la definición original (20261019130000_pensiones_reportes.sql); solo cambia cómo se arma la ruta:
-- la extensión sale del nombre y debe ser una de las admitidas. Al ser create or replace conserva los permisos.
create or replace function public.reservar_reporte_pension(p_categoria text, p_nombre text, p_tamano integer)
returns table (id uuid, ruta text)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid(); v_ruta text; v_extension text;
begin
  if (select public.mi_rol()) is distinct from 'administradora'::public.rol then
    raise exception 'Sólo la Administradora puede subir reportes' using errcode = '42501';
  end if;
  v_extension := lower(substring(p_nombre from '\.([A-Za-z0-9]+)$'));
  if v_extension is null or v_extension not in ('pdf', 'xlsx', 'xls', 'csv') then
    raise exception 'Formato de reporte no admitido' using errcode = '22023';
  end if;
  v_ruta := p_categoria || '/' || v_id::text || '.' || v_extension;
  insert into public.pensiones_reportes_reservas (id, categoria, nombre, ruta, tamano, usuario_id)
  values (v_id, p_categoria, p_nombre, v_ruta, p_tamano, auth.uid());
  return query select v_id, v_ruta;
end;
$$;

comment on table public.pensiones_reportes is
  'Máximo 12 archivos (PDF, Excel o CSV) por categoría. Los retirados se borran de Storage por cola durable; sólo se descargan con sesión vigente en la app.';
