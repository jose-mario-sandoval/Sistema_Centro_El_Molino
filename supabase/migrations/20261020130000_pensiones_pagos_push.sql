-- Evento durable por abono nuevo. No se crean eventos para los pagos históricos de la casa.
alter table public.perfiles add column avisar_pensiones boolean not null default true;
comment on column public.perfiles.avisar_pensiones is
  'Avisos de pagos de pensiones. Preferencia independiente, utilizada exclusivamente por Administradora.';

create table public.pensiones_pagos_push (
  pago_id uuid primary key references public.pensiones_pagos(id) on delete cascade,
  completado boolean not null,
  creado_en timestamptz not null default now()
);
create table public.avisos_pago_pension_push (
  pago_id uuid not null references public.pensiones_pagos_push(pago_id) on delete cascade,
  suscripcion_id uuid not null references public.suscripciones_push(id) on delete cascade,
  reservado_en timestamptz not null default now(),
  primary key(pago_id, suscripcion_id)
);
create index avisos_pago_pension_push_suscripcion_idx on public.avisos_pago_pension_push(suscripcion_id);
alter table public.pensiones_pagos_push enable row level security;
alter table public.avisos_pago_pension_push enable row level security;
revoke all on public.pensiones_pagos_push, public.avisos_pago_pension_push from public, anon, authenticated;
grant all on public.pensiones_pagos_push, public.avisos_pago_pension_push to service_role;
comment on table public.avisos_pago_pension_push is
  'Reserva antes del proveedor por abono y dispositivo. Evita duplicados entre procesos y ante respuesta perdida; sin nombres ni contenido push.';

create function public.crear_evento_pago_pension()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.pensiones_pagos_push(pago_id, completado)
    select new.id, coalesce(sum(p.abono_centavos), 0) >= new.monto_centavos
    from public.pensiones_pagos p where p.usuario_id = new.usuario_id and p.periodo = new.periodo;
  return new;
end;
$$;
revoke all on function public.crear_evento_pago_pension() from public, anon, authenticated;
create trigger pensiones_pagos_evento_push after insert on public.pensiones_pagos
  for each row execute function public.crear_evento_pago_pension();

-- La RPC anterior conserva su contrato (devuelve también abonos anteriores). Esta envoltura usa
-- su mismo candado, y devuelve únicamente movimientos creados por ESTA transacción. Nunca se
-- comparan timestamps ni se interpretan filas históricas devueltas como abonos nuevos.
create function public.marcar_pensiones_con_movimientos(
  p_periodos date[],
  p_montos_esperados integer[] default null,
  p_pagados_esperados integer[] default null,
  p_abonos integer[] default null
)
returns table(pago_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_usuario uuid := auth.uid(); v_anteriores uuid[];
begin
  if not coalesce(public.mi_rol() in ('director', 'residente'), false) then
    raise exception 'Solo podés marcar tus propias pensiones' using errcode = '42501';
  end if;
  if p_abonos is not null and p_pagados_esperados is null then
    raise exception 'Revisá lo ya pagado antes de confirmar un abono' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_usuario::text, 19120000));
  select coalesce(array_agg(p.id), '{}'::uuid[]) into v_anteriores
    from public.pensiones_pagos p where p.usuario_id = v_usuario and p.periodo = any(p_periodos);
  return query select p.id from public.marcar_pensiones(
    p_periodos, p_montos_esperados, p_pagados_esperados, p_abonos
  ) p where not (p.id = any(v_anteriores));
end;
$$;
revoke all on function public.marcar_pensiones_con_movimientos(date[], integer[], integer[], integer[]) from public, anon;
grant execute on function public.marcar_pensiones_con_movimientos(date[], integer[], integer[], integer[]) to authenticated;

-- Solo los datos necesarios para el dispositivo: nunca se consulta ni se devuelve nombre.
create function public.aviso_pago_pension(p_pago_id uuid)
returns table(siglas text, periodo date, abono_centavos integer, completado boolean)
language sql stable security definer set search_path = '' as $$
  select p.siglas, a.periodo, a.abono_centavos, e.completado
    from public.pensiones_pagos_push e
    join public.pensiones_pagos a on a.id = e.pago_id
    join public.perfiles p on p.id = a.usuario_id
    where e.pago_id = p_pago_id and a.abono_centavos > 0
$$;
create function public.reservar_avisos_pago_pension(p_pago_id uuid, p_suscripciones uuid[])
returns uuid[] language sql security definer set search_path = '' as $$
  with reservados as (
    insert into public.avisos_pago_pension_push(pago_id, suscripcion_id)
    select e.pago_id, s.id from public.pensiones_pagos_push e
      join public.pensiones_pagos a on a.id = e.pago_id and a.abono_centavos > 0
      join public.suscripciones_push s on s.id = any(p_suscripciones)
      join public.perfiles p on p.id = s.usuario_id
    where e.pago_id = p_pago_id and p.activo and p.rol = 'administradora' and p.avisar_pensiones
    on conflict do nothing returning suscripcion_id
  ) select coalesce(array_agg(suscripcion_id), '{}'::uuid[]) from reservados
$$;
revoke all on function public.aviso_pago_pension(uuid), public.reservar_avisos_pago_pension(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.aviso_pago_pension(uuid), public.reservar_avisos_pago_pension(uuid, uuid[]) to service_role;
