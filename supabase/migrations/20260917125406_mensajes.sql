-- =========================================================
-- Pista 03-A: mensajes, reacciones y registro de moderación
-- Spec §3.2, §5.2, §5.3, §7
-- =========================================================

-- ---------- Tablas ----------
create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references public.perfiles (id) on delete cascade,
  padre_id uuid references public.mensajes (id) on delete cascade,
  -- '\S': al menos un carácter que no sea espacio, tab ni salto de línea (btrim solo quita espacios).
  texto text not null check (texto ~ '\S' and char_length(texto) <= 2000),
  creado_en timestamptz not null default now()
);

comment on table public.mensajes is 'padre_id nulo = publicación; no nulo = respuesta (un solo nivel).';

-- Feed: publicaciones de más nueva a más antigua; respuestas por publicación en orden cronológico.
create index mensajes_publicaciones_idx on public.mensajes (creado_en desc, id desc) where padre_id is null;
create index mensajes_respuestas_idx on public.mensajes (padre_id, creado_en) where padre_id is not null;
create index mensajes_autor_idx on public.mensajes (autor_id);

create table public.reacciones (
  mensaje_id uuid not null references public.mensajes (id) on delete cascade,
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  creado_en timestamptz not null default now(),
  primary key (mensaje_id, usuario_id)
);

create index reacciones_usuario_idx on public.reacciones (usuario_id);

create table public.registro_moderacion (
  id uuid primary key default gen_random_uuid(),
  moderador_id uuid not null references public.perfiles (id) on delete cascade,
  autor_id uuid not null references public.perfiles (id) on delete cascade,
  texto_eliminado text not null,
  era_respuesta boolean not null,
  eliminado_en timestamptz not null default now()
);

comment on table public.registro_moderacion is 'Solo lo escribe el trigger mensajes_registro_moderacion; solo lo lee el Director.';

create index registro_moderacion_eliminado_en_idx on public.registro_moderacion (eliminado_en desc);
create index registro_moderacion_moderador_idx on public.registro_moderacion (moderador_id);
create index registro_moderacion_autor_idx on public.registro_moderacion (autor_id);

-- ---------- Respuestas de un solo nivel (MOL03) ----------
-- Si el padre no existe, este trigger no dice nada y la FK responde 23503.
-- Solo en INSERT: los mensajes no se editan (authenticated no tiene UPDATE). Validar también un UPDATE de
-- padre_id exigiría revisar además que el mensaje no tenga respuestas y no sea su propio padre.
create or replace function public.validar_padre_mensaje()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.padre_id is not null and exists (
    select 1 from public.mensajes m
    where m.id = new.padre_id and m.padre_id is not null
  ) then
    raise exception 'Solo se puede responder a una publicación, no a otra respuesta'
      using errcode = 'MOL03';
  end if;
  return new;
end;
$$;

create trigger mensajes_un_nivel
  before insert on public.mensajes
  for each row execute function public.validar_padre_mensaje();

-- ---------- Reacciones solo en publicaciones (MOL03) ----------
create or replace function public.validar_reaccion_publicacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.mensajes m
    where m.id = new.mensaje_id and m.padre_id is not null
  ) then
    raise exception 'Solo se puede reaccionar a publicaciones, no a respuestas'
      using errcode = 'MOL03';
  end if;
  return new;
end;
$$;

create trigger reacciones_solo_publicaciones
  before insert or update of mensaje_id on public.reacciones
  for each row execute function public.validar_reaccion_publicacion();

-- ---------- RLS (spec §5.2) ----------
alter table public.mensajes enable row level security;
alter table public.reacciones enable row level security;
alter table public.registro_moderacion enable row level security;

create policy "mensajes: lectura para usuarios activos"
  on public.mensajes for select
  to authenticated
  using ((select public.soy_activo()));

create policy "mensajes: publicar como uno mismo"
  on public.mensajes for insert
  to authenticated
  with check ((select public.soy_activo()) and autor_id = (select auth.uid()));

-- mi_rol() ya exige cuenta activa.
create policy "mensajes: borra el autor o el Director"
  on public.mensajes for delete
  to authenticated
  using (
    (select public.soy_activo())
    and (autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
  );
-- Sin política de UPDATE: los mensajes no se editan (spec §1).

create policy "reacciones: lectura para usuarios activos"
  on public.reacciones for select
  to authenticated
  using ((select public.soy_activo()));

create policy "reacciones: reaccionar como uno mismo"
  on public.reacciones for insert
  to authenticated
  with check ((select public.soy_activo()) and usuario_id = (select auth.uid()));

create policy "reacciones: quitar la propia"
  on public.reacciones for delete
  to authenticated
  using ((select public.soy_activo()) and usuario_id = (select auth.uid()));

create policy "registro_moderacion: lectura solo del Director"
  on public.registro_moderacion for select
  to authenticated
  using ((select public.mi_rol()) = 'director');
-- Sin políticas de escritura: solo el trigger (security definer) inserta.

-- ---------- Registro de moderación (spec §5.3) ----------
-- Por qué no pg_trigger_depth(): en un AFTER ROW trigger, las filas borradas por ON DELETE CASCADE
-- también ven profundidad 1 (la acción RI encola sus AFTER triggers en la sentencia externa).
-- Regla: una respuesta cuya publicación ya no existe se borró en cascada y no se registra.
-- Los AFTER triggers corren al final de la sentencia, con la cascada ya aplicada y visible.
create or replace function public.registrar_moderacion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Sin usuario (servidor, scripts, limpieza demo) o borrado propio: no es moderación.
  if (select auth.uid()) is null or old.autor_id = (select auth.uid()) then
    return old;
  end if;

  -- Respuesta borrada en cascada al borrar su publicación.
  if old.padre_id is not null and not exists (
    select 1 from public.mensajes m where m.id = old.padre_id
  ) then
    return old;
  end if;

  insert into public.registro_moderacion (moderador_id, autor_id, texto_eliminado, era_respuesta)
  values ((select auth.uid()), old.autor_id, old.texto, old.padre_id is not null);
  return old;
end;
$$;

create trigger mensajes_registro_moderacion
  after delete on public.mensajes
  for each row execute function public.registrar_moderacion();

-- ---------- Tiempo real (spec §7) ----------
-- Los eventos DELETE traen solo la clave primaria (identidad de réplica por defecto):
-- mensajes → id; reacciones → (mensaje_id, usuario_id).
alter publication supabase_realtime add table public.mensajes, public.reacciones;

-- ---------- Permisos explícitos ----------
-- Supabase ya no expone automáticamente las tablas nuevas de public (desde 2026-05-30).
-- CI corre con auto_expose_new_tables = false (igual que producción): sin estos GRANT,
-- las pruebas de integración y e2e fallan con 42501.
grant select, insert, delete on table public.mensajes to authenticated;
grant select, insert, update, delete on table public.mensajes to service_role;
grant select, insert, delete on table public.reacciones to authenticated;
grant select, insert, update, delete on table public.reacciones to service_role;
-- Solo lectura: el trigger security definer es el único que escribe y nadie borra entradas.
grant select on table public.registro_moderacion to authenticated;
grant select, insert, update, delete on table public.registro_moderacion to service_role;
