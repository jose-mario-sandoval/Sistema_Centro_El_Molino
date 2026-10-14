-- =========================================================
-- Mensajes privados para todos los roles.
--
-- Hasta ahora solo Administración podía pedir que un mensaje lo leyeran únicamente el Director y
-- Administración (`solo_director`). Ahora lo puede pedir cualquier persona con la cuenta activa: un
-- Residente (para algo personal que le escribe a Administración), el Director o Administración.
-- Quien lo escribe elige "Toda la casa" o "Solo Administración y el Director".
--
-- Lo que no cambia: lo lee quien lo escribió, el Director y Administración, nunca otro Residente; las
-- respuestas heredan la visibilidad y no cambia después. El mensaje de un Residente sigue pasando por la
-- aprobación del Director (público o privado), y hasta que lo apruebe Administración no lo ve (RLS).
-- La columna conserva su nombre `solo_director` para no romper el código ya desplegado.
-- =========================================================

comment on column public.mensajes.solo_director is
  'true = privado: lo leen solo quien lo escribió, el Director y Administración. Lo fuerza mensajes_forzar_estado: lo puede pedir cualquier rol con cuenta activa, las respuestas heredan el de su publicación, y no cambia después.';

-- ---------- El trigger deja pedir "privado" a cualquier rol ----------
-- Igual que la de 20261013130000_mensajes_solo_director.sql, salvo quién puede pedirlo.
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
    -- Una respuesta hereda la visibilidad de su publicación (quien responde ya la ve: RLS). Una
    -- publicación es privada si quien la escribe lo pide, sea cual sea su rol (con la cuenta activa). Sin
    -- sesión (siembras y pruebas) se respeta la que venga.
    if new.padre_id is not null then
      new.solo_director := coalesce(
        (select m.solo_director from public.mensajes m where m.id = new.padre_id),
        false
      );
    elsif (select auth.uid()) is not null then
      new.solo_director := new.solo_director and v_rol is not null;
    end if;
    return new;
  end if;

  -- La visibilidad no cambia después de publicar.
  new.solo_director := old.solo_director;

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
