-- La etiqueta de una notificación solo reemplaza la tarjeta del teléfono: no evita que dos procesos
-- envíen el mismo push. Reservamos cada evento por dispositivo antes de llamar al proveedor.
alter table public.mensajes add column aviso_revision bigint not null default 1;

create function public.revisar_aviso_mensaje()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.aviso_revision := 1;
  else
    new.aviso_revision := old.aviso_revision + case when
      new.estado is distinct from old.estado
      or new.texto is distinct from old.texto
      or new.motivo_rechazo is distinct from old.motivo_rechazo
    then 1 else 0 end;
  end if;
  return new;
end;
$$;

-- PostgreSQL ejecuta los BEFORE por nombre: después de mensajes_forzar_estado, con su estado definitivo.
create trigger mensajes_z_revision_aviso
  before insert or update on public.mensajes
  for each row execute function public.revisar_aviso_mensaje();

create table public.avisos_mensaje_push (
  mensaje_id uuid not null references public.mensajes (id) on delete cascade,
  revision bigint not null check (revision > 0),
  tipo text not null check (tipo in ('publicacion', 'respuesta', 'pendiente', 'moderacion')),
  suscripcion_id uuid not null references public.suscripciones_push (id) on delete cascade,
  reservado_en timestamptz not null default now(),
  primary key (mensaje_id, revision, tipo, suscripcion_id)
);
create index avisos_mensaje_push_suscripcion_idx on public.avisos_mensaje_push (suscripcion_id);
alter table public.avisos_mensaje_push enable row level security;
revoke all on table public.avisos_mensaje_push from public, anon, authenticated;
grant select, insert, update, delete on table public.avisos_mensaje_push to service_role;

comment on table public.avisos_mensaje_push is
  'Reserva atómica por evento y dispositivo. Se registra antes del proveedor para evitar reenvíos incluso si se pierde su respuesta. Sin texto ni datos personales.';

create function public.reservar_avisos_mensaje(
  p_mensaje_id uuid,
  p_revision bigint,
  p_tipo text,
  p_suscripciones uuid[]
)
returns uuid[]
language sql
security definer
set search_path = ''
as $$
  with reservados as (
    insert into public.avisos_mensaje_push (mensaje_id, revision, tipo, suscripcion_id)
    select m.id, m.aviso_revision, p_tipo, s.id
    from public.mensajes m
    left join public.mensajes padre on padre.id = m.padre_id
    join public.suscripciones_push s on s.id = any(p_suscripciones)
    join public.perfiles p on p.id = s.usuario_id
    where m.id = p_mensaje_id and m.aviso_revision = p_revision
      and p.activo and p.avisar_mensajes
      -- Una respuesta no revela tampoco la existencia de una publicación que no se puede leer.
      and (m.padre_id is null or (
        padre.padre_id is null
        and (p.rol = 'director' or padre.autor_id = p.id or (
          padre.estado = 'aprobado'
          and (not padre.solo_director or p.rol = 'administracion')
        ))
      ))
      and case
        when p_tipo in ('publicacion', 'respuesta') then
          m.estado = 'aprobado' and p.id <> m.autor_id
          and ((p_tipo = 'publicacion' and m.padre_id is null)
            or (p_tipo = 'respuesta' and m.padre_id is not null and padre.estado = 'aprobado'))
          and (not (m.solo_director or coalesce(padre.solo_director, false))
            or p.rol in ('director', 'administracion') or p.id = coalesce(padre.autor_id, m.autor_id))
        when p_tipo = 'pendiente' then
          m.estado = 'pendiente' and p.rol = 'director' and p.id <> m.autor_id
        when p_tipo = 'moderacion' then
          m.estado in ('aprobado', 'rechazado') and p.id = m.autor_id
        else false
      end
    on conflict do nothing
    returning suscripcion_id
  )
  select coalesce(array_agg(suscripcion_id), '{}'::uuid[]) from reservados;
$$;

revoke all on function public.reservar_avisos_mensaje(uuid, bigint, text, uuid[]) from public, anon, authenticated;
grant execute on function public.reservar_avisos_mensaje(uuid, bigint, text, uuid[]) to service_role;
