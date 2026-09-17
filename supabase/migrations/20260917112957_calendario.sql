-- =========================================================
-- Pista 04: Calendario
-- Spec §3.2 (eventos), §5.1 y §5.2: los usuarios activos leen; solo el Director escribe.
-- =========================================================

create table public.eventos (
  id uuid primary key default gen_random_uuid(),
  -- El título llega recortado (zod): la base rechaza espacios al inicio o al final.
  titulo text not null check (titulo = btrim(titulo) and length(titulo) between 1 and 120),
  -- Mismo rango que acepta la app (lib/validacion/calendario.ts y ?mes=).
  fecha date not null check (fecha between '2000-01-01' and '2099-12-31'),
  hora time,
  creado_por uuid not null references public.perfiles (id) on delete cascade,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

comment on table public.eventos is 'Eventos de la casa. Solo el Director crea, edita y elimina (spec §5.1).';

create index eventos_fecha_idx on public.eventos (fecha);

-- ---------- Marcas de tiempo y autor: las fija la base, no el cliente ----------
create or replace function public.eventos_antes_de_guardar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_en := now();
  else
    new.creado_por := old.creado_por;
    new.creado_en := old.creado_en;
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger eventos_antes_de_guardar
  before insert or update on public.eventos
  for each row execute function public.eventos_antes_de_guardar();

-- ---------- RLS ----------
alter table public.eventos enable row level security;

-- GRANT explícitos obligatorios (índice §3.4): Supabase ya no expone tablas nuevas; las políticas deciden qué filas.
-- anon no tiene nada que hacer aquí: sin privilegios, ni siquiera llega a las políticas.
revoke all on table public.eventos from anon;
grant select, insert, delete on table public.eventos to authenticated;
-- UPDATE solo en las columnas que edita el Director. creado_por, creado_en y actualizado_en
-- quedan fuera (el trigger BEFORE UPDATE igual puede fijarlas: el privilegio se revisa sobre el SET).
revoke update on table public.eventos from authenticated;
grant update (titulo, fecha, hora) on table public.eventos to authenticated;
grant select, insert, update, delete on table public.eventos to service_role;

create policy "eventos: lectura para usuarios activos"
  on public.eventos for select
  to authenticated
  using ((select public.soy_activo()));

-- mi_rol() devuelve null si la cuenta está inactiva: un Director desactivado no escribe.
create policy "eventos: el Director crea"
  on public.eventos for insert
  to authenticated
  with check (
    (select public.mi_rol()) = 'director'
    and creado_por = (select auth.uid())
  );

create policy "eventos: el Director edita"
  on public.eventos for update
  to authenticated
  using ((select public.mi_rol()) = 'director')
  with check ((select public.mi_rol()) = 'director');

create policy "eventos: el Director elimina"
  on public.eventos for delete
  to authenticated
  using ((select public.mi_rol()) = 'director');
