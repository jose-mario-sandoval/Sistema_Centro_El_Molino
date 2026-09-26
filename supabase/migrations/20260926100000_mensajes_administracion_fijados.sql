-- =========================================================
-- Mensajes (spec 2026-09-26 §1): Administración publica directo, como el Director; Director y
-- Administración fijan publicaciones aprobadas arriba del feed, sin límite o hasta una hora.
-- =========================================================

-- ---------- Fijado ----------
-- Sin `grant update` sobre estas columnas: solo las escriben fijar_mensaje/desfijar_mensaje (abajo).
alter table public.mensajes
  add column fijado_en timestamptz,
  add column fijado_hasta timestamptz,
  add column fijado_por uuid references public.perfiles (id) on delete set null;

comment on column public.mensajes.fijado_en is 'Nulo = no fijada. Solo lo escriben fijar_mensaje/desfijar_mensaje.';
comment on column public.mensajes.fijado_hasta is 'Nulo con fijado_en = fijada hasta que la quiten. La calcula el servidor.';
comment on column public.mensajes.fijado_por is 'Quién la fijó (Director o Administración). En pantalla se muestra el rol, nunca el nombre.';

-- Fijada: publicación aprobada con fin posterior al inicio. No fijada: las tres nulas. El trigger de
-- abajo desfija antes de que esto se evalúe cuando un mensaje deja de estar aprobado.
alter table public.mensajes
  add constraint mensajes_fijado_valido check (
    (fijado_en is null and fijado_hasta is null and fijado_por is null)
    or (
      fijado_en is not null
      and padre_id is null
      and estado = 'aprobado'
      and (fijado_hasta is null or fijado_hasta > fijado_en)
    )
  );

create index mensajes_fijados_idx on public.mensajes (fijado_en desc) where fijado_en is not null;
create index mensajes_fijado_por_idx on public.mensajes (fijado_por) where fijado_por is not null;

-- ---------- El estado lo decide el servidor ----------
create or replace function public.mensajes_forzar_estado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol public.rol := (select public.mi_rol());
begin
  if tg_op = 'INSERT' then
    -- Director y Administración publican directo. mi_rol() nulo (cuenta inactiva o llave secreta):
    -- `null in (...)` es null y el case cae en pendiente.
    new.estado := case when v_rol in ('director', 'administracion') then 'aprobado' else 'pendiente' end;
    new.motivo_rechazo := null;
    -- authenticated tiene INSERT sobre toda la tabla: nadie publica algo ya fijado...
    new.fijado_en := null;
    new.fijado_hasta := null;
    new.fijado_por := null;
    -- ...ni con una fecha inventada (una de 2099 quedaría primera en el feed para siempre, y la cola de
    -- moderación mostraría esa hora). Sin sesión (llave secreta: siembras y pruebas) se respeta la que venga.
    if (select auth.uid()) is not null then
      new.creado_en := now();
    end if;
    return new;
  end if;

  -- Quien no es Director vuelve el mensaje a pendiente solo si toca el contenido o corrige un rechazo
  -- (aunque reenvíe el mismo texto). Así fijar/desfijar desde Administración (que pasa por acá con su
  -- propio rol, aunque las funciones sean security definer) no lo des-aprueba.
  -- "is distinct from" y no "<>": mi_rol() nulo (cuenta recién desactivada, JWT todavía válido) no
  -- debe poder autoaprobarse (ver 20260921220000_aprobacion_mensajes.sql).
  if v_rol is distinct from 'director' and (
    old.estado = 'rechazado'
    or new.texto is distinct from old.texto
    or new.estado is distinct from old.estado
    or new.motivo_rechazo is distinct from old.motivo_rechazo
  ) then
    new.estado := 'pendiente';
    new.motivo_rechazo := null;
  end if;

  -- Lo que deja de estar aprobado deja de estar fijado.
  if new.estado <> 'aprobado' then
    new.fijado_en := null;
    new.fijado_hasta := null;
    new.fijado_por := null;
  end if;
  return new;
end;
$$;

-- ---------- Fijar y desfijar ----------
-- security definer: authenticated no tiene UPDATE sobre fijado_* y Administración no tiene política de
-- UPDATE. Solo publicaciones aprobadas, que ya son visibles para todo usuario activo.
create function public.fijar_mensaje(p_id uuid, p_hasta timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fijado_en timestamptz;
begin
  -- mi_rol() ya exige cuenta activa; coalesce: sin rol no hay permiso.
  if not coalesce((select public.mi_rol()) in ('director', 'administracion'), false) then
    raise exception 'Solo el Director y Administración fijan publicaciones' using errcode = '42501';
  end if;
  if p_hasta is not null and p_hasta <= now() then
    raise exception 'El fin de lo fijado ya pasó' using errcode = '22023';
  end if;

  -- Volver a fijar una fijada reemplaza fin y autor, y la sube arriba de las demás.
  update public.mensajes
     set fijado_en = now(),
         fijado_hasta = p_hasta,
         fijado_por = (select auth.uid())
   where id = p_id
     and padre_id is null
     and estado = 'aprobado'
  returning fijado_en into v_fijado_en;

  if not found then
    raise exception 'No hay una publicación aprobada con ese id' using errcode = 'P0002';
  end if;
  return v_fijado_en;
end;
$$;

create function public.desfijar_mensaje(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select public.mi_rol()) in ('director', 'administracion'), false) then
    raise exception 'Solo el Director y Administración quitan publicaciones fijadas' using errcode = '42501';
  end if;

  -- Solo filas fijadas (y por lo tanto aprobadas): un UPDATE sobre un rechazado, viniendo de
  -- Administración, lo devolvería a pendiente en el trigger.
  update public.mensajes
     set fijado_en = null,
         fijado_hasta = null,
         fijado_por = null
   where id = p_id
     and fijado_en is not null;

  -- Ya desfijada (dos personas la quitan a la vez): no es error. Solo entre las aprobadas: esta función no
  -- pasa por RLS, y distinguir "existe pero no la ves" de "no existe" delataría pendientes y rechazados ajenos.
  if not found and not exists (
    select 1 from public.mensajes m where m.id = p_id and m.padre_id is null and m.estado = 'aprobado'
  ) then
    raise exception 'No hay una publicación aprobada con ese id' using errcode = 'P0002';
  end if;
end;
$$;

revoke execute on function public.fijar_mensaje(uuid, timestamptz) from public, anon;
revoke execute on function public.desfijar_mensaje(uuid) from public, anon;
grant execute on function public.fijar_mensaje(uuid, timestamptz) to authenticated;
grant execute on function public.desfijar_mensaje(uuid) to authenticated;
