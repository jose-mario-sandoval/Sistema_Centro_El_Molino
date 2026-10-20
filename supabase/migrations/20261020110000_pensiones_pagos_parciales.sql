-- Pagos parciales de pensiones. Hasta ahora cada mes tenía una sola declaración de pago, siempre por la cuota
-- completa. Ahora cada fila de `pensiones_pagos` es un ABONO: un mes se puede pagar en varios abonos y queda
-- pagado cuando suman la cuota. Sigue sin haber edición, borrado ni reversión desde la aplicación.
--
--   monto_centavos  = la cuota de ese mes (copia histórica, igual en todos los abonos del mes: la del primero)
--   abono_centavos  = lo que se pagó en esa fila (1 hasta lo que faltaba)
--
-- Las filas que ya existen eran pagos completos: su abono es su monto.

alter table public.pensiones_pagos add column id uuid not null default gen_random_uuid();
alter table public.pensiones_pagos add column abono_centavos integer;
update public.pensiones_pagos set abono_centavos = monto_centavos;
alter table public.pensiones_pagos
  alter column abono_centavos set not null,
  drop constraint pensiones_pagos_pkey,
  add constraint pensiones_pagos_pkey primary key (id),
  add constraint pensiones_pagos_abono_valido check (abono_centavos between 1 and monto_centavos);
create index pensiones_pagos_usuario_periodo_idx on public.pensiones_pagos (usuario_id, periodo, registrado_en, id);
comment on table public.pensiones_pagos is
  'Abonos definitivos, propios e inmutables: un mes puede tener varios y queda pagado cuando suman la cuota. Monto (cuota del mes) y categoría son una copia histórica, igual en todos los abonos del mes. Sin edición, borrado ni reversión para la aplicación.';
comment on column public.pensiones_pagos.abono_centavos is 'Lo pagado en este abono. La suma de los abonos de un mes nunca supera la cuota de ese mes (lo exige marcar_pensiones bajo el candado de la persona).';

-- Lo pagado de un mes es la suma de sus abonos; la cuota y la categoría quedan fijas desde el primer abono.
-- Misma firma que antes: mis_pensiones() y presupuesto_pensiones() siguen igual.
create or replace function public.valores_pension(p_usuario_id uuid, p_periodo date)
returns table(categoria text, monto_centavos integer, pagado_centavos integer, registrado_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select coalesce(p.categoria, case when i.incluido then c.categoria end),
    coalesce(p.monto_centavos, case when i.incluido then c.monto_centavos end),
    coalesce(p.pagado, 0), p.ultimo
  from (select 1) base
  left join lateral (
    select (array_agg(x.categoria order by x.registrado_en, x.id))[1] as categoria,
      (array_agg(x.monto_centavos order by x.registrado_en, x.id))[1] as monto_centavos,
      sum(x.abono_centavos)::integer as pagado,
      max(x.registrado_en) as ultimo
    from public.pensiones_pagos x where x.usuario_id = p_usuario_id and x.periodo = p_periodo
  ) p on true
  left join lateral (
    select cuota.categoria, cuota.monto_centavos from public.pensiones_cuotas cuota
    where cuota.usuario_id = p_usuario_id and cuota.desde <= p_periodo
    order by cuota.desde desc limit 1
  ) c on true
  left join lateral (
    select incluido from public.pensiones_participacion
    where usuario_id = p_usuario_id and desde <= p_periodo
    order by desde desc limit 1
  ) i on true
$$;

-- Nueva firma: se suelta la anterior (con dos argumentos más defaults, dejarla causaría llamadas ambiguas).
--   p_montos_esperados   cuotas que vio la persona (si cambiaron: 40001, igual que antes)
--   p_pagados_esperados  lo ya pagado de cada mes que vio la persona (si cambió, p. ej. un doble clic: 40001)
--   p_abonos             cuánto paga ahora de cada mes. Sin él, paga todo lo que falta de cada mes (y un mes ya
--                        pagado del todo se omite: reintentar no duplica nada).
-- Devuelve todos los abonos de esos meses (como antes devolvía los pagos de esos meses).
drop function public.marcar_pensiones(date[], integer[]);
create function public.marcar_pensiones(
  p_periodos date[],
  p_montos_esperados integer[] default null,
  p_pagados_esperados integer[] default null,
  p_abonos integer[] default null
)
returns setof public.pensiones_pagos
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_periodo date;
  v_valor record;
  v_indice integer;
  v_abono integer;
  v_abonos integer[] := array[]::integer[];
begin
  if not coalesce(public.mi_rol() in ('director', 'residente'), false) then
    raise exception 'Solo podés marcar tus propias pensiones' using errcode = '42501';
  end if;
  if p_periodos is null or cardinality(p_periodos) not between 1 and 12
    or exists(select 1 from unnest(p_periodos) p where p is null or extract(day from p) <> 1 or p not between '2000-01-01'::date and '2200-12-01'::date)
    or (select count(distinct p) from unnest(p_periodos) p) <> cardinality(p_periodos)
    or (p_montos_esperados is not null and cardinality(p_montos_esperados) <> cardinality(p_periodos))
    or (p_pagados_esperados is not null and cardinality(p_pagados_esperados) <> cardinality(p_periodos))
    or (p_abonos is not null and cardinality(p_abonos) <> cardinality(p_periodos)) then
    raise exception 'Elegí de uno a doce meses distintos y válidos' using errcode = '22023';
  end if;
  if p_abonos is not null and exists(select 1 from unnest(p_abonos) a where a is null or a not between 1 and 100000000) then
    raise exception 'Revisá los montos que vas a pagar' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_usuario::text, 19120000));
  -- Otra sesión pudo desactivar la cuenta mientras esta esperaba el lock.
  if not coalesce(public.mi_rol() in ('director', 'residente'), false) then
    raise exception 'La cuenta ya no puede registrar pagos' using errcode = '42501';
  end if;
  -- Validar el lote completo antes de escribir; la transacción también protege fallas posteriores.
  for v_indice in 1..cardinality(p_periodos) loop
    v_periodo := p_periodos[v_indice];
    select * into v_valor from public.valores_pension(v_usuario, v_periodo);
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
  insert into public.pensiones_pagos(usuario_id, periodo, categoria, monto_centavos, abono_centavos)
    select v_usuario, t.periodo, v.categoria, v.monto_centavos, t.abono
    from unnest(p_periodos, v_abonos) as t(periodo, abono)
    cross join lateral public.valores_pension(v_usuario, t.periodo) v
    where t.abono > 0;
  return query select p.* from public.pensiones_pagos p
    where p.usuario_id = v_usuario and p.periodo = any(p_periodos) order by p.periodo, p.registrado_en, p.id;
end;
$$;
revoke all on function public.marcar_pensiones(date[], integer[], integer[], integer[]) from public, anon;
grant execute on function public.marcar_pensiones(date[], integer[], integer[], integer[]) to authenticated;
