-- El titular de una pensión y quien registra su pago son identidades distintas.
-- Los pagos anteriores fueron propios: solo se completa su autor, sin modificar importes,
-- períodos, fechas, snapshots ni crear nuevos eventos de aviso.
alter table public.pensiones_pagos add column registrado_por uuid references public.perfiles(id) on delete restrict;
-- Un exento puede conservar abonos reales adelantados: completar solo su autor no es
-- un nuevo pago. Suspender exclusivamente esta defensa durante el backfill dentro de
-- la transacción de migración y restaurarla antes de habilitar cualquier RPC nueva.
alter table public.pensiones_pagos disable trigger pensiones_pagos_proteger_exencion;
update public.pensiones_pagos set registrado_por = usuario_id;
alter table public.pensiones_pagos enable trigger pensiones_pagos_proteger_exencion;
alter table public.pensiones_pagos alter column registrado_por set not null;
-- Las siembras y tareas de mantenimiento sin sesión conservan el contrato de INSERT
-- anterior; con sesión el autor siempre procede de Auth, nunca del payload.
create function public.identificar_registro_pension()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.registrado_por := coalesce(auth.uid(), new.registrado_por, new.usuario_id);
  return new;
end;
$$;
revoke all on function public.identificar_registro_pension() from public, anon, authenticated;
create trigger pensiones_pagos_identificar_registro before insert on public.pensiones_pagos
  for each row execute function public.identificar_registro_pension();
comment on column public.pensiones_pagos.registrado_por is
  'Cuenta que confirmó el abono: el propio titular o un Director. usuario_id siempre identifica a quien debe la pensión.';
comment on table public.pensiones_pagos is
  'Abonos definitivos e inmutables del titular usuario_id, confirmados por registrado_por. Cuota y categoría son snapshots históricos del primer abono del mes. Sin edición, borrado ni reversión para la aplicación.';

-- Una sola comprobación para lecturas/operaciones propias y las realizadas por el Director.
-- Privada: los wrappers públicos fijan si la operación es propia o de la casa.
create function public.validar_titular_pension(p_usuario_id uuid, p_de_la_casa boolean)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_de_la_casa then
    if public.mi_rol() is distinct from 'director' then
      raise exception 'Solo el Director puede gestionar pensiones de la casa' using errcode = '42501';
    end if;
    if p_usuario_id = auth.uid() then
      raise exception 'Tu pensión personal se registra en Marcar pensiones' using errcode = '22023';
    end if;
  elsif p_usuario_id is distinct from auth.uid()
    or not coalesce(public.mi_rol() in ('director', 'residente'), false) then
    raise exception 'Solo podés registrar tus propias pensiones' using errcode = '42501';
  end if;
  if not exists(select 1 from public.perfiles p
    where p.id = p_usuario_id and p.activo and p.rol in ('residente', 'director')) then
    raise exception 'La persona debe tener una cuenta activa de Residente o Director' using errcode = '22023';
  end if;
end;
$$;
revoke all on function public.validar_titular_pension(uuid, boolean) from public, anon, authenticated;

-- La casa consulta exactamente los mismos valores históricos y exenciones que el titular.
create function public.pensiones_de(p_usuario_id uuid, p_anio integer)
returns table(periodo date, categoria text, monto_centavos integer, pagado_centavos integer, registrado_en timestamptz, exento boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.validar_titular_pension(p_usuario_id, true);
  if p_anio is null or p_anio not between 2000 and 2200 then
    raise exception 'Revisá el año' using errcode = '22023';
  end if;
  return query select make_date(p_anio, mes, 1), v.categoria, v.monto_centavos,
    v.pagado_centavos, v.registrado_en, public.pensiones_es_exento(p_usuario_id, make_date(p_anio, mes, 1))
    from generate_series(1, 12) mes
    cross join lateral public.valores_pension(p_usuario_id, make_date(p_anio, mes, 1)) v
    order by mes;
end;
$$;
revoke all on function public.pensiones_de(uuid, integer) from public, anon;
grant execute on function public.pensiones_de(uuid, integer) to authenticated;

-- Motor único. Devuelve solo movimientos nuevos mediante INSERT RETURNING, de modo que un
-- reintento no confunde históricos con eventos nuevos. Los wrappers conservan sus contratos.
create function public.registrar_abonos_pension(
  p_usuario_id uuid,
  p_de_la_casa boolean,
  p_periodos date[],
  p_montos_esperados integer[],
  p_pagados_esperados integer[],
  p_abonos integer[]
)
returns setof public.pensiones_pagos
language plpgsql security definer set search_path = '' as $$
declare
  v_periodo date;
  v_valor record;
  v_indice integer;
  v_abono integer;
  v_abonos integer[] := array[]::integer[];
begin
  perform public.validar_titular_pension(p_usuario_id, p_de_la_casa);
  if p_periodos is null or cardinality(p_periodos) not between 1 and 12
    or array_ndims(p_periodos) <> 1 or array_lower(p_periodos, 1) <> 1
    or exists(select 1 from unnest(p_periodos) p where p is null or extract(day from p) <> 1 or p not between '2000-01-01'::date and '2200-12-01'::date)
    or (select count(distinct p) from unnest(p_periodos) p) <> cardinality(p_periodos)
    or (p_montos_esperados is not null and (cardinality(p_montos_esperados) <> cardinality(p_periodos) or array_ndims(p_montos_esperados) <> 1 or array_lower(p_montos_esperados, 1) <> 1))
    or (p_pagados_esperados is not null and (cardinality(p_pagados_esperados) <> cardinality(p_periodos) or array_ndims(p_pagados_esperados) <> 1 or array_lower(p_pagados_esperados, 1) <> 1))
    or (p_abonos is not null and (cardinality(p_abonos) <> cardinality(p_periodos) or array_ndims(p_abonos) <> 1 or array_lower(p_abonos, 1) <> 1)) then
    raise exception 'Elegí de uno a doce meses distintos y válidos' using errcode = '22023';
  end if;
  if p_abonos is not null and p_pagados_esperados is null then
    raise exception 'Revisá lo ya pagado antes de confirmar un abono' using errcode = '22023';
  end if;
  if p_abonos is not null and exists(select 1 from unnest(p_abonos) a where a is null or a not between 1 and 100000000) then
    raise exception 'Revisá los montos que vas a pagar' using errcode = '22023';
  end if;
  -- Misma clave que cuotas, participación y exención: el titular y todos los Directores
  -- se serializan por la persona que debe la pensión, nunca por quien confirma.
  perform pg_advisory_xact_lock(hashtextextended(p_usuario_id::text, 19120000));
  perform public.validar_titular_pension(p_usuario_id, p_de_la_casa);
  -- Se valida el lote completo bajo el candado antes de insertar cualquiera de sus abonos.
  for v_indice in 1..cardinality(p_periodos) loop
    v_periodo := p_periodos[v_indice];
    if public.pensiones_es_exento(p_usuario_id, v_periodo) then
      raise exception 'Esta cuenta está exenta de pensión; no requiere registrar pagos' using errcode = '22023';
    end if;
    select * into v_valor from public.valores_pension(p_usuario_id, v_periodo);
    if v_valor.monto_centavos is null then
      raise exception 'Uno de los meses todavía no tiene una cuota válida' using errcode = '22023';
    end if;
    if p_montos_esperados is not null and p_montos_esperados[v_indice] is distinct from v_valor.monto_centavos then
      raise exception 'La cuota cambió. Revisá los montos antes de confirmar nuevamente' using errcode = '40001';
    end if;
    if p_pagados_esperados is not null and p_pagados_esperados[v_indice] is distinct from v_valor.pagado_centavos then
      raise exception 'Lo pagado de un mes cambió. Revisá los montos antes de confirmar nuevamente' using errcode = '40001';
    end if;
    v_abono := coalesce(p_abonos[v_indice], v_valor.monto_centavos - v_valor.pagado_centavos);
    if v_abono > v_valor.monto_centavos - v_valor.pagado_centavos then
      raise exception 'Ese monto supera lo que falta de un mes' using errcode = '22023';
    end if;
    v_abonos := v_abonos || v_abono;
  end loop;
  return query insert into public.pensiones_pagos(usuario_id, periodo, categoria, monto_centavos, abono_centavos, registrado_por)
    select p_usuario_id, t.periodo, v.categoria, v.monto_centavos, t.abono, auth.uid()
    from unnest(p_periodos, v_abonos) as t(periodo, abono)
    cross join lateral public.valores_pension(p_usuario_id, t.periodo) v
    where t.abono > 0
    returning *;
end;
$$;
revoke all on function public.registrar_abonos_pension(uuid, boolean, date[], integer[], integer[], integer[]) from public, anon, authenticated;

-- Contrato legado: devuelve todos los abonos de los períodos, incluidos los anteriores.
create or replace function public.marcar_pensiones(
  p_periodos date[], p_montos_esperados integer[] default null,
  p_pagados_esperados integer[] default null, p_abonos integer[] default null
)
returns setof public.pensiones_pagos
language plpgsql security definer set search_path = '' as $$
begin
  perform public.registrar_abonos_pension(auth.uid(), false, p_periodos, p_montos_esperados, p_pagados_esperados, p_abonos);
  return query select p.* from public.pensiones_pagos p
    where p.usuario_id = auth.uid() and p.periodo = any(p_periodos)
    order by p.periodo, p.registrado_en, p.id;
end;
$$;

create or replace function public.marcar_pensiones_con_movimientos(
  p_periodos date[], p_montos_esperados integer[] default null,
  p_pagados_esperados integer[] default null, p_abonos integer[] default null
)
returns table(pago_id uuid)
language sql security definer set search_path = '' as $$
  select p.id from public.registrar_abonos_pension(auth.uid(), false, p_periodos, p_montos_esperados, p_pagados_esperados, p_abonos) p
$$;

create function public.marcar_pensiones_de_con_movimientos(
  p_usuario_id uuid, p_periodos date[], p_montos_esperados integer[],
  p_pagados_esperados integer[] default null, p_abonos integer[] default null
)
returns table(pago_id uuid)
language sql security definer set search_path = '' as $$
  select p.id from public.registrar_abonos_pension(p_usuario_id, true, p_periodos, p_montos_esperados, p_pagados_esperados, p_abonos) p
$$;
revoke all on function public.marcar_pensiones(date[], integer[], integer[], integer[]),
  public.marcar_pensiones_con_movimientos(date[], integer[], integer[], integer[]),
  public.marcar_pensiones_de_con_movimientos(uuid, date[], integer[], integer[], integer[]) from public, anon;
grant execute on function public.marcar_pensiones(date[], integer[], integer[], integer[]),
  public.marcar_pensiones_con_movimientos(date[], integer[], integer[], integer[]),
  public.marcar_pensiones_de_con_movimientos(uuid, date[], integer[], integer[], integer[]) to authenticated;

-- Ningún rol de la app escribe las tablas directamente ni puede falsificar el autor.
-- Las políticas SELECT existentes siguen limitando al Residente a sus propios pagos y
-- permiten al Director consultar historiales. Administradora mantiene solo RPC de presupuesto.
revoke insert, update, delete on public.pensiones_pagos from public, anon, authenticated;
-- aviso_pago_pension() ya obtiene siglas de pensiones_pagos.usuario_id (titular).
-- Sus triggers/eventos y reserva única pago/dispositivo permanecen vigentes sin recrearlos.
