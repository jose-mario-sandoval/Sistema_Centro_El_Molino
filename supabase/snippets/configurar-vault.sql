-- =========================================================
-- Configurar Supabase Vault para los recordatorios (spec §8.3, Anexo A.3 paso 4)
--
-- Quién: el dueño del proyecto, una sola vez (o al cambiar dominio o CRON_SECRET).
-- Dónde: Supabase → SQL Editor del proyecto de producción.
-- Cómo:
--   1. Copiar este archivo al SQL Editor (NO editarlo en el repo).
--   2. Reemplazar los dos valores de abajo:
--      - url_app: dominio de producción de Vercel (https://<proyecto>.vercel.app o dominio propio), sin "/" final;
--        nunca la URL de un despliegue puntual. Tiene que ser el dominio FINAL, el que responde sin
--        redirigir: pg_net no sigue redirecciones, así que si en net._http_response aparece un 3xx
--        (301, 307, 308) este valor redirige (p. ej. del dominio sin "www" al dominio con "www", o del
--        .vercel.app al dominio propio) y hay que cargar acá el destino de esa redirección.
--      - cron_secret: exactamente el mismo valor que CRON_SECRET en Vercel (Production).
--   3. Ejecutar. Después, borrar la consulta del historial del SQL Editor.
-- Se puede volver a ejecutar: si los secretos existen, los actualiza.
-- =========================================================
do $$
declare
  v_url constant text := 'https://REEMPLAZAR.vercel.app';
  v_secreto constant text := 'REEMPLAZAR_CON_CRON_SECRET';
  v_id uuid;
begin
  if v_url like '%REEMPLAZAR%' or v_secreto like '%REEMPLAZAR%' then
    raise exception 'Reemplazá los valores de url_app y cron_secret antes de ejecutar';
  end if;

  if v_url not like 'https://%' or right(v_url, 1) = '/' then
    raise exception 'url_app debe empezar con https:// y no terminar en /';
  end if;

  select s.id into v_id from vault.secrets s where s.name = 'url_app';
  if v_id is null then
    perform vault.create_secret(v_url, 'url_app', 'URL de producción de la app (recordatorios)');
  else
    perform vault.update_secret(v_id, v_url, 'url_app', 'URL de producción de la app (recordatorios)');
  end if;

  v_id := null;
  select s.id into v_id from vault.secrets s where s.name = 'cron_secret';
  if v_id is null then
    perform vault.create_secret(v_secreto, 'cron_secret', 'CRON_SECRET de Vercel (recordatorios)');
  else
    perform vault.update_secret(v_id, v_secreto, 'cron_secret', 'CRON_SECRET de Vercel (recordatorios)');
  end if;
end;
$$;

-- Verificación (no muestra los valores):
select name, length(decrypted_secret) > 0 as tiene_valor
from vault.decrypted_secrets
where name in ('url_app', 'cron_secret')
order by name;
-- Esperado: dos filas, ambas con tiene_valor = true.

-- Diez minutos después, para confirmar que el cron llega a la app (plan 06, Tarea 23, paso B2):
--   select status_code, error_msg, created from net._http_response order by created desc limit 3;
-- Esperado: status_code = 202. Un 401 = cron_secret distinto de CRON_SECRET; un 404 = url_app
-- incorrecta; un 3xx = url_app redirige y hay que cargar el dominio final.
