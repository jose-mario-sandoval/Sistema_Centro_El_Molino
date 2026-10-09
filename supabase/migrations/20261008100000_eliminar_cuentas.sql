-- =========================================================
-- Cuentas: el Director puede eliminar definitivamente una cuenta desactivada.
--
-- Eliminar una cuenta borra el usuario de Auth y, en cascada, su perfil y todo lo suyo (comidas,
-- plan, ausencias, mensajes, suscripciones a avisos). Lo que NO es suyo sino de la casa se tiene
-- que conservar: los eventos del calendario, las series y los enlaces de cena extra que esa
-- persona cargó. Hasta ahora `creado_por` los borraba en cascada.
--
-- 1. `creado_por` de eventos, series_eventos y enlaces_confirmacion: `on delete set null`.
-- 2. El trigger de eventos deja vaciar `creado_por` (lo hace esa regla al borrar la cuenta), pero
--    sigue sin dejar cambiarlo por otro.
-- 3. resumen_para_eliminar_cuenta(): lo que se va a perder, para decirlo antes de confirmar. La
--    acción del servidor la llama siempre antes de borrar: si esta migración no está aplicada, la
--    función no existe y la cuenta no se borra (así nunca se pierden eventos por desplegar antes).
-- =========================================================

alter table public.eventos
  alter column creado_por drop not null,
  drop constraint eventos_creado_por_fkey,
  add constraint eventos_creado_por_fkey
    foreign key (creado_por) references public.perfiles (id) on delete set null;

alter table public.series_eventos
  alter column creado_por drop not null,
  drop constraint series_eventos_creado_por_fkey,
  add constraint series_eventos_creado_por_fkey
    foreign key (creado_por) references public.perfiles (id) on delete set null;

alter table public.enlaces_confirmacion
  alter column creado_por drop not null,
  drop constraint enlaces_confirmacion_creado_por_fkey,
  add constraint enlaces_confirmacion_creado_por_fkey
    foreign key (creado_por) references public.perfiles (id) on delete set null;

comment on column public.eventos.creado_por is
  'Quién lo cargó. Null si esa cuenta se eliminó: el evento es de la casa y se conserva.';

-- Marcas de tiempo y autor: las fija la base, no el cliente. `creado_por` no se cambia nunca; solo
-- se vacía cuando se elimina la cuenta de quien lo creó (on delete set null es un UPDATE y pasa por
-- este trigger). `authenticated` no tiene permiso de UPDATE sobre esa columna.
create or replace function public.eventos_antes_de_guardar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.creado_en := now();
  else
    if new.creado_por is not null then
      new.creado_por := old.creado_por;
    end if;
    new.creado_en := old.creado_en;
  end if;
  new.actualizado_en := now();
  return new;
end;
$$;

-- Lo que se pierde al eliminar una cuenta, y si se puede (solo las desactivadas). Sin filas: la
-- cuenta no existe. Solo la llama el servidor, con la llave secreta y después de comprobar que
-- quien pide es Director.
create function public.resumen_para_eliminar_cuenta(p_usuario uuid)
returns table (
  activo boolean,
  mensajes integer,
  respuestas_de_otros integer,
  eventos integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.activo,
    (select count(*)::integer from public.mensajes m where m.autor_id = p.id),
    -- Lo que otras personas respondieron en sus publicaciones: se borra con la publicación.
    (select count(*)::integer
       from public.mensajes r
       join public.mensajes pub on pub.id = r.padre_id
      where pub.autor_id = p.id and r.autor_id <> p.id),
    (select count(*)::integer from public.eventos e where e.creado_por = p.id)
  from public.perfiles p
  where p.id = p_usuario
$$;

revoke execute on function public.resumen_para_eliminar_cuenta(uuid) from public, anon, authenticated;
grant execute on function public.resumen_para_eliminar_cuenta(uuid) to service_role;
