-- =========================================================
-- Pista 06 (Parte A): suscripciones push, avisos enviados y
-- llamada programada a /api/cron/recordatorios, y limpieza diaria
-- del historial de pg_cron (cron.job_run_details, últimos 7 días)
-- Spec §3.2, §5.2, §8.2, §8.3
-- =========================================================

-- ---------- Suscripciones push (una por navegador/dispositivo) ----------
create table public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  endpoint text not null unique
    check (endpoint like 'https://%' and length(endpoint) <= 2048),
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth text not null check (length(auth) between 1 and 100),
  creado_en timestamptz not null default now()
);

create index suscripciones_push_usuario_id_idx on public.suscripciones_push (usuario_id);

comment on table public.suscripciones_push is
  'Suscripciones Web Push. La app las registra y reasigna por endpoint desde /api/push con la llave secreta.';

alter table public.suscripciones_push enable row level security;

-- Permisos explícitos (índice §3.4): sin UPDATE con sesión; la reasignación la hace el servidor.
grant select, insert, delete on table public.suscripciones_push to authenticated;
grant select, insert, update, delete on table public.suscripciones_push to service_role;
revoke update on table public.suscripciones_push from anon, authenticated;

create policy "suscripciones_push: ver las propias"
  on public.suscripciones_push for select
  to authenticated
  using ((select public.soy_activo()) and usuario_id = (select auth.uid()));

create policy "suscripciones_push: registrar las propias"
  on public.suscripciones_push for insert
  to authenticated
  with check ((select public.soy_activo()) and usuario_id = (select auth.uid()));

create policy "suscripciones_push: borrar las propias"
  on public.suscripciones_push for delete
  to authenticated
  using ((select public.soy_activo()) and usuario_id = (select auth.uid()));

-- ---------- Recordatorios ya enviados (spec §8.3) ----------
create table public.avisos_enviados (
  fecha date not null,
  comida public.tiempo_comida not null,
  enviado_en timestamptz not null default now(),
  primary key (fecha, comida)
);

comment on table public.avisos_enviados is
  'Una fila por (fecha, comida) con recordatorio tomado. Solo el servidor con la llave secreta.';

alter table public.avisos_enviados enable row level security;

-- Solo el servidor con la llave secreta (índice §3.4).
grant select, insert, update, delete on table public.avisos_enviados to service_role;
revoke all on table public.avisos_enviados from anon, authenticated;
-- Sin políticas: nadie con sesión lee ni escribe (spec §5.2).

-- ---------- Extensiones para tareas programadas ----------
-- La pista 02-A también habilita pg_cron; "if not exists" evita depender del orden de las migraciones.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------- Llamada a la app para recordatorios (spec §8.3) ----------
-- La URL y el secreto viven en Supabase Vault (supabase/snippets/configurar-vault.sql), nunca en migraciones.
-- Devuelve el id de la petición de pg_net, o null si Vault todavía no está configurado.
create or replace function public.llamar_recordatorios()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secreto text;
begin
  select s.decrypted_secret into v_url
  from vault.decrypted_secrets s
  where s.name = 'url_app';

  select s.decrypted_secret into v_secreto
  from vault.decrypted_secrets s
  where s.name = 'cron_secret';

  -- Sin configurar (CI, o antes de que el dueño cargue Vault): no hace nada.
  if coalesce(v_url, '') = '' or coalesce(v_secreto, '') = '' then
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || '/api/cron/recordatorios',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secreto,
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  );
end;
$$;

comment on function public.llamar_recordatorios() is
  'Llamada por pg_cron cada 5 minutos: POST a <url_app>/api/cron/recordatorios con el secreto de Vault.';

revoke execute on function public.llamar_recordatorios() from public, anon, authenticated;

-- ---------- Job cada 5 minutos ----------
-- cron.schedule con un nombre existente reemplaza ese job: volver a ejecutarlo no lo duplica.
select cron.schedule(
  'recordatorios-hora-limite',
  '*/5 * * * *',
  'select public.llamar_recordatorios()'
);

-- ---------- Limpieza diaria del historial de pg_cron ----------
-- Los jobs de cierre y recordatorios corren cada 5 minutos: sin limpieza, cron.job_run_details
-- crece unas 576 filas por día. Se conservan los últimos 7 días para diagnosticar.
-- Horario de pg_cron en UTC: 03:15 UTC = 21:15 en El Salvador.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'limpiar-historial-cron') then
    perform cron.unschedule('limpiar-historial-cron');
  end if;
end;
$$;

select cron.schedule(
  'limpiar-historial-cron',
  '15 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
