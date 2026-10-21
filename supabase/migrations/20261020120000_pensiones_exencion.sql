-- Excepción de una sola cuenta, identificada exclusivamente por UUID y con vigencia mensual.
-- No se pudo verificar el UUID en el entorno de desarrollo: queda SIN ACTIVAR hasta que
-- mantenimiento invoque activar_exencion_pension(UUID_VERIFICADO). No se busca por nombre
-- en ninguna regla permanente y fuera_de_conteos conserva su finalidad de comidas.
create table public.pensiones_exencion (
  unica boolean primary key default true check (unica),
  usuario_id uuid not null unique references public.perfiles(id) on delete restrict,
  desde date not null default public.mes_actual_pensiones()
    check (desde between '2000-01-01' and '2200-12-01' and extract(day from desde) = 1)
);
comment on table public.pensiones_exencion is
  'Única excepción de pensión, pendiente de activar con el UUID verificado de Dani y José. Solo mantenimiento; no es una cuota de cero ni depende del nombre o fuera_de_conteos. No altera pagos ni cuotas históricos.';
alter table public.pensiones_exencion enable row level security;
revoke all on public.pensiones_exencion from public, anon, authenticated;
grant select on public.pensiones_exencion to authenticated;
grant all on public.pensiones_exencion to service_role;
create policy "pensiones_exencion: consulta del Director" on public.pensiones_exencion
  for select to authenticated using ((select public.mi_rol()) = 'director');

create function public.pensiones_es_exento(p_usuario_id uuid, p_periodo date)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.pensiones_exencion e
    where e.usuario_id = p_usuario_id and e.desde <= p_periodo)
$$;
revoke all on function public.pensiones_es_exento(uuid, date) from public, anon, authenticated;

-- Activación única, administrativa e idempotente. El primer mes se toma de El Salvador
-- al activar; nunca permite sustituir la identidad ni extender la excepción a otra cuenta.
create function public.activar_exencion_pension(p_usuario_id uuid)
returns date language plpgsql security definer set search_path = '' as $$
declare v_existente public.pensiones_exencion%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('pensiones-exencion-unica', 20120000));
  select * into v_existente from public.pensiones_exencion;
  if found then
    if v_existente.usuario_id is distinct from p_usuario_id then
      raise exception 'La exención ya está vinculada a una única cuenta' using errcode = '22023';
    end if;
    return v_existente.desde;
  end if;
  if p_usuario_id is null then
    raise exception 'Falta el UUID verificado de la cuenta exenta' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_usuario_id::text, 19120000));
  if not exists(select 1 from public.perfiles where id = p_usuario_id and activo and rol in ('director', 'residente')) then
    raise exception 'El UUID debe corresponder a la cuenta activa verificada de Director o Residente' using errcode = '22023';
  end if;
  insert into public.pensiones_exencion(usuario_id) values(p_usuario_id)
    returning * into v_existente;
  return v_existente.desde;
end;
$$;
revoke all on function public.activar_exencion_pension(uuid) from public, anon, authenticated;
grant execute on function public.activar_exencion_pension(uuid) to service_role;

-- Defensa también para escrituras SQL directas: ni la RPC ni un insert puede crear
-- pagos ficticios o nuevas cuotas para el período exento. Los registros existentes permanecen.
create function public.proteger_exencion_pension()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_periodo date;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.usuario_id::text, 19120000));
  if tg_table_name = 'pensiones_cuotas' then v_periodo := new.desde;
  else v_periodo := new.periodo;
  end if;
  if public.pensiones_es_exento(new.usuario_id, v_periodo) then
    raise exception 'Esta cuenta está exenta de pensión; no admite cuotas ni pagos para ese mes' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_exencion_pension() from public, anon, authenticated;
create trigger pensiones_cuotas_proteger_exencion before insert or update on public.pensiones_cuotas
  for each row execute function public.proteger_exencion_pension();
create trigger pensiones_pagos_proteger_exencion before insert or update on public.pensiones_pagos
  for each row execute function public.proteger_exencion_pension();

-- Se conservan los abonos reales incluso si fueron adelantados. Solo la cuota exigible
-- desde la vigencia pasa a cero; los meses anteriores mantienen exactamente su cálculo.
create or replace function public.valores_pension(p_usuario_id uuid, p_periodo date)
returns table(categoria text, monto_centavos integer, pagado_centavos integer, registrado_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select coalesce(p.categoria, case when i.incluido then c.categoria end),
    case when public.pensiones_es_exento(p_usuario_id, p_periodo) then 0
      else coalesce(p.monto_centavos, case when i.incluido then c.monto_centavos end) end,
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

-- Se añade el estado explícito a las RPC, compartidas por las vistas mensual y anual.
drop function public.mis_pensiones(integer);
create function public.mis_pensiones(p_anio integer)
returns table(periodo date, categoria text, monto_centavos integer, pagado_centavos integer, registrado_en timestamptz, exento boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.mi_rol() in ('director', 'residente'), false) then
    raise exception 'Solo podés consultar tus propias pensiones' using errcode = '42501';
  end if;
  if p_anio is null or p_anio not between 2000 and 2200 then
    raise exception 'Revisá el año' using errcode = '22023';
  end if;
  return query select make_date(p_anio, mes, 1), v.categoria, v.monto_centavos, v.pagado_centavos, v.registrado_en,
    public.pensiones_es_exento(auth.uid(), make_date(p_anio, mes, 1))
    from generate_series(1, 12) mes
    cross join lateral public.valores_pension(auth.uid(), make_date(p_anio, mes, 1)) v
    order by mes;
end;
$$;
drop function public.presupuesto_pensiones(date);
create function public.presupuesto_pensiones(p_periodo date)
returns table(usuario_id uuid, etiqueta text, categoria text, monto_centavos integer, pagado_centavos integer, registrado_en timestamptz, exento boolean)
language plpgsql stable security definer set search_path = '' as $$
declare v_rol public.rol := public.mi_rol();
begin
  if not coalesce(v_rol in ('director', 'administradora'), false) then
    raise exception 'No tenés acceso al presupuesto' using errcode = '42501';
  end if;
  if p_periodo is null or extract(day from p_periodo) <> 1
    or p_periodo not between '2000-01-01'::date and '2200-12-01'::date then
    raise exception 'Revisá el mes y el año' using errcode = '22023';
  end if;
  return query
    select p.id, case when v_rol = 'director' then p.nombre else p.siglas end,
      v.categoria, v.monto_centavos, v.pagado_centavos, v.registrado_en,
      public.pensiones_es_exento(p.id, p_periodo)
    from public.perfiles p
    cross join lateral public.valores_pension(p.id, p_periodo) v
    where v.monto_centavos is not null or exists (
      select 1 from public.pensiones_participacion i
      where i.usuario_id = p.id and i.desde <= p_periodo and i.incluido
        and not exists(select 1 from public.pensiones_participacion posterior
          where posterior.usuario_id = p.id and posterior.desde > i.desde and posterior.desde <= p_periodo)
    )
    order by case when v_rol = 'director' then p.nombre else p.siglas end, p.id;
end;
$$;
revoke all on function public.mis_pensiones(integer), public.presupuesto_pensiones(date) from public, anon;
grant execute on function public.mis_pensiones(integer), public.presupuesto_pensiones(date) to authenticated;

-- La comprobación de exención dentro de marcar_pensiones se instala a continuación,
-- conservando íntegros sus parámetros y las reglas de pagos parciales.
create or replace function public.marcar_pensiones(
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
    if public.pensiones_es_exento(v_usuario, v_periodo) then
      raise exception 'Esta cuenta está exenta de pensión; no requiere registrar pagos' using errcode = '22023';
    end if;
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
