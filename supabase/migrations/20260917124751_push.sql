-- =========================================================
-- Pista 06 (Parte A): suscripciones push, avisos enviados y
-- llamada programada a /api/cron/recordatorios
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
