-- Registro de moderación: tres meses calendario desde eliminado_en, no 90 días.
-- La fecha de vencimiento se calcula desde cada eliminación, en UTC explícito.
-- Restar tres meses a ahora no es equivalente al sumar tres meses a eliminado_en:
-- una eliminación del 31 de enero vence el 30 de abril, no el 1 de mayo.
alter policy "registro_moderacion: lectura solo del Director"
  on public.registro_moderacion
  using (
    (select public.mi_rol()) = 'director'
    and (((eliminado_en at time zone 'UTC') + interval '3 months') at time zone 'UTC') > (select now())
  );

-- Desempate por id para cargar de a 20 sin perder entradas eliminadas en el mismo instante.
drop index public.registro_moderacion_eliminado_en_idx;
create index registro_moderacion_eliminado_en_idx
  on public.registro_moderacion (eliminado_en desc, id desc);

-- La expresión UTC es inmutable: permite buscar lo vencido sin recorrer todo el registro.
-- El otro índice conserva el orden de las páginas por eliminación e id.
create index registro_moderacion_vencimiento_idx
  on public.registro_moderacion ((((eliminado_en at time zone 'UTC') + interval '3 months') at time zone 'UTC'));

-- Solo la conexión privilegiada/pg_cron la ejecuta. Sin security definer ni acceso desde la API.
create or replace procedure public.limpiar_registro_moderacion(p_ahora timestamptz default now())
language sql
set search_path = ''
as $$
  delete from public.registro_moderacion
  where (((eliminado_en at time zone 'UTC') + interval '3 months') at time zone 'UTC') <= p_ahora;
$$;

revoke execute on procedure public.limpiar_registro_moderacion(timestamptz)
  from public, anon, authenticated, service_role;

comment on table public.registro_moderacion is
  'Mensajes ajenos eliminados por el Director. Se conservan tres meses desde eliminado_en; limpieza diaria por pg_cron.';

-- Limpia también lo vencido que ya existía antes de activar la retención.
call public.limpiar_registro_moderacion();

-- pg_cron ya está habilitado por las migraciones de comidas/push.
-- Con cron.timezone = GMT (valor predeterminado), 03:30 UTC = 21:30 en El Salvador.
-- RLS oculta lo vencido entre una limpieza y la siguiente.
select cron.schedule(
  'limpiar-registro-moderacion',
  '30 3 * * *',
  'CALL public.limpiar_registro_moderacion()'
);
