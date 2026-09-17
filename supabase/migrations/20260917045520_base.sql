-- =========================================================
-- Fase 0: tipos, perfiles, horas límite y funciones auxiliares
-- Spec §3.1, §3.2 (perfiles, horas_limite), §3.3, §5.2
-- =========================================================

-- ---------- Tipos ----------
create type public.rol as enum ('director', 'residente', 'administracion');
create type public.tiempo_comida as enum ('desayuno', 'almuerzo', 'cena');
create type public.estado_comida as enum ('si', 'no', 'temprano', 'tarde', 'bolsa', 'enfermo');
create type public.origen_seleccion as enum ('persona', 'plan');

-- ---------- Zona horaria (única fuente en SQL; TS: lib/fechas ZONA_HORARIA) ----------
create or replace function public.zona_horaria_app()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'America/El_Salvador'::text
$$;

-- ---------- Perfiles ----------
create table public.perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  siglas text not null check (length(btrim(siglas)) between 1 and 6),
  correo text not null unique check (correo = lower(correo)),
  rol public.rol not null,
  activo boolean not null default true,
  debe_cambiar_contrasena boolean not null default false,
  avisar_hora_limite boolean not null default true,
  avisar_mensajes boolean not null default true,
  creado_en timestamptz not null default now()
);

comment on table public.perfiles is 'Una fila por cuenta. Se escribe solo desde el servidor con la llave secreta.';

-- ---------- Funciones auxiliares para RLS ----------
create or replace function public.soy_activo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.activo from public.perfiles p where p.id = (select auth.uid())),
    false
  )
$$;

create or replace function public.mi_rol()
returns public.rol
language sql
stable
security definer
set search_path = ''
as $$
  select p.rol from public.perfiles p
  where p.id = (select auth.uid()) and p.activo
$$;

revoke execute on function public.soy_activo() from public, anon;
revoke execute on function public.mi_rol() from public, anon;
grant execute on function public.soy_activo() to authenticated;
grant execute on function public.mi_rol() to authenticated;
grant execute on function public.zona_horaria_app() to authenticated, service_role;

-- ---------- RLS de perfiles ----------
alter table public.perfiles enable row level security;

-- Cualquier usuario activo ve todas las filas, incluidas las inactivas (spec §5.2).
create policy "perfiles: lectura para usuarios activos"
  on public.perfiles for select
  to authenticated
  using ((select public.soy_activo()));
-- Sin políticas de escritura: solo el servidor con la llave secreta.

-- ---------- Al menos un Director activo (spec §3.3) ----------
create or replace function public.validar_director_activo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.rol = 'director' and old.activo
     and (new.rol <> 'director' or not new.activo) then
    perform pg_advisory_xact_lock(hashtext('perfiles_director_activo'));
    if not exists (
      select 1 from public.perfiles p
      where p.rol = 'director' and p.activo and p.id <> old.id
    ) then
      raise exception 'Debe quedar al menos un Director activo'
        using errcode = 'MOL02';
    end if;
  end if;
  return new;
end;
$$;

create trigger perfiles_director_activo
  before update of rol, activo on public.perfiles
  for each row execute function public.validar_director_activo();

-- ---------- Horas límite (spec §3.2) ----------
create table public.horas_limite (
  comida public.tiempo_comida primary key,
  dia_relativo smallint not null check (dia_relativo in (0, -1)),
  hora time not null
);

insert into public.horas_limite (comida, dia_relativo, hora) values
  ('desayuno', -1, '21:00'),
  ('almuerzo', 0, '10:00'),
  ('cena', 0, '16:00');

alter table public.horas_limite enable row level security;

create policy "horas_limite: lectura para usuarios activos"
  on public.horas_limite for select
  to authenticated
  using ((select public.soy_activo()));

create policy "horas_limite: el Director actualiza"
  on public.horas_limite for update
  to authenticated
  using ((select public.mi_rol()) = 'director')
  with check ((select public.mi_rol()) = 'director');

-- ---------- Permisos explícitos ----------
-- Supabase ya no expone automáticamente las tablas nuevas de public (desde 2026-05-30).
grant select on table public.perfiles to authenticated;
grant select, insert, update, delete on table public.perfiles to service_role;
grant select, update on table public.horas_limite to authenticated;
grant select, insert, update, delete on table public.horas_limite to service_role;
