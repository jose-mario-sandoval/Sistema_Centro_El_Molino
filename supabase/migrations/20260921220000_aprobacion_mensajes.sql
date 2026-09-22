-- =========================================================
-- Aprobación de mensajes: los de Residentes quedan pendientes hasta que el
-- Director los aprueba o rechaza; los del Director se publican directo. El
-- estado lo fuerza un trigger, nunca lo que mande el cliente.
-- =========================================================

create type public.estado_mensaje as enum ('pendiente', 'aprobado', 'rechazado');

alter table public.mensajes
  add column estado public.estado_mensaje not null default 'pendiente',
  add column motivo_rechazo text;

alter table public.mensajes
  add constraint mensajes_motivo_rechazo_valido check (
    motivo_rechazo is null or (motivo_rechazo = btrim(motivo_rechazo) and length(motivo_rechazo) between 1 and 500)
  );

comment on column public.mensajes.estado is 'Lo fuerza mensajes_forzar_estado; el cliente no lo controla.';

-- ---------- El estado lo decide el servidor ----------
create function public.mensajes_forzar_estado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.estado := case when (select public.mi_rol()) = 'director' then 'aprobado' else 'pendiente' end;
    new.motivo_rechazo := null;
  elsif (select public.mi_rol()) is distinct from 'director' then
    -- "is distinct from", no "<>": mi_rol() devuelve null si la cuenta está desactivada, y
    -- `null <> 'director'` es null (ni true ni false) — el elsif no entraría y el estado que mandó
    -- el cliente pasaría tal cual. Con cuentas activas da lo mismo; con una recién desactivada
    -- (JWT todavía válido) es la diferencia entre bloquear la autoaprobación o no.
    -- El autor solo llega acá para corregir un rechazo (la política de UPDATE se lo exige):
    -- vuelve a pendiente sin importar qué mande, y no puede autoaprobarse.
    new.estado := 'pendiente';
    new.motivo_rechazo := null;
  end if;
  return new;
end;
$$;

create trigger mensajes_forzar_estado
  before insert or update on public.mensajes
  for each row execute function public.mensajes_forzar_estado();

-- ---------- Quién ve qué ----------
drop policy "mensajes: lectura para usuarios activos" on public.mensajes;

create policy "mensajes: lectura según estado"
  on public.mensajes for select
  to authenticated
  using (
    (select public.soy_activo())
    and (estado = 'aprobado' or autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
  );

-- Antes no miraba el mensaje al que pertenece: una reacción a un mensaje pendiente/rechazado quedaba
-- visible igual (sin texto, pero delatando que ese mensaje existe).
drop policy "reacciones: lectura para usuarios activos" on public.reacciones;

create policy "reacciones: lectura según visibilidad del mensaje"
  on public.reacciones for select
  to authenticated
  using (
    (select public.soy_activo())
    and exists (
      select 1 from public.mensajes m
      where m.id = reacciones.mensaje_id
        and (m.estado = 'aprobado' or m.autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
    )
  );

-- ---------- Edición: el Director modera, el autor corrige un rechazo ----------
grant update (texto, estado, motivo_rechazo) on table public.mensajes to authenticated;

create policy "mensajes: el Director modera"
  on public.mensajes for update
  to authenticated
  using ((select public.mi_rol()) = 'director')
  with check ((select public.mi_rol()) = 'director');

-- soy_activo() de más, además del trigger: mismo motivo que "is distinct from" arriba, y consistente
-- con el resto del archivo (todas las demás políticas de mensajes ya la exigen).
create policy "mensajes: el autor corrige un rechazo"
  on public.mensajes for update
  to authenticated
  using ((select public.soy_activo()) and autor_id = (select auth.uid()) and estado = 'rechazado')
  with check ((select public.soy_activo()) and autor_id = (select auth.uid()));
