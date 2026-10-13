-- =========================================================
-- Mensajes "solo para el Director": Administración puede escribir algo que no deben leer los
-- Residentes. Lo ven el Director y Administración (la cocina y la limpieza hablan con el Director por
-- este canal) y nadie más.
--
-- Lo decide quien publica, solo Administración: el trigger lo fuerza según el rol de *quien tiene la
-- sesión*, nunca lo que mande el cliente, y no se puede cambiar después. Las respuestas heredan la
-- visibilidad de su publicación.
-- =========================================================

alter table public.mensajes
  add column solo_director boolean not null default false;

comment on column public.mensajes.solo_director is
  'true = lo ven solo el Director y Administración. Lo fuerza mensajes_forzar_estado: solo Administración lo pone, las respuestas heredan el de su publicación, y no cambia después.';

-- ---------- El trigger decide la visibilidad ----------
-- Igual que la de 20260926100000_mensajes_administracion_fijados.sql, más el manejo de solo_director.
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
    -- publicación solo es "solo Director" si la escribe Administración. Sin sesión (siembras y pruebas)
    -- se respeta la que venga.
    if new.padre_id is not null then
      new.solo_director := coalesce(
        (select m.solo_director from public.mensajes m where m.id = new.padre_id),
        false
      );
    elsif (select auth.uid()) is not null then
      new.solo_director := new.solo_director and v_rol = 'administracion';
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

-- ---------- Quién lo lee ----------
drop policy "mensajes: lectura según estado" on public.mensajes;

create policy "mensajes: lectura según estado y visibilidad"
  on public.mensajes for select
  to authenticated
  using (
    (select public.soy_activo())
    and (estado = 'aprobado' or autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
    and (
      not solo_director
      or autor_id = (select auth.uid())
      or (select public.mi_rol()) in ('director', 'administracion')
    )
  );

-- Las reacciones miran el mensaje con esta misma política (la subconsulta pasa por RLS), pero se deja
-- explícito: una reacción a un mensaje que no se ve no debe asomar ni su existencia.
drop policy "reacciones: lectura según visibilidad del mensaje" on public.reacciones;

create policy "reacciones: lectura según visibilidad del mensaje"
  on public.reacciones for select
  to authenticated
  using (
    (select public.soy_activo())
    and exists (
      select 1 from public.mensajes m
      where m.id = reacciones.mensaje_id
        and (m.estado = 'aprobado' or m.autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
        and (
          not m.solo_director
          or m.autor_id = (select auth.uid())
          or (select public.mi_rol()) in ('director', 'administracion')
        )
    )
  );
