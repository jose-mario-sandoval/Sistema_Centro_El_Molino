-- Cuotas y participación con vigencia mensual. Las modificaciones autorizadas solo afectan
-- el mes actual y los futuros: la meta de un mes pasado nunca depende del perfil actual.
create function public.mes_actual_pensiones()
returns date language sql stable set search_path = ''
as $$ select date_trunc('month', now() at time zone public.zona_horaria_app())::date $$;
revoke all on function public.mes_actual_pensiones() from public, anon;
grant execute on function public.mes_actual_pensiones() to authenticated, service_role;

create table public.pensiones_participacion (
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  desde date not null check (desde between '2000-01-01' and '2200-12-01' and extract(day from desde) = 1),
  incluido boolean not null,
  primary key(usuario_id, desde)
);
create table public.pensiones_cuotas (
  usuario_id uuid not null references public.perfiles(id) on delete restrict,
  desde date not null check (desde between '2000-01-01' and '2200-12-01' and extract(day from desde) = 1),
  categoria text not null check (categoria in ('universitario', 'profesional')),
  monto_centavos integer not null check (monto_centavos between 1 and 100000000),
  modificado_en timestamptz not null default now(),
  primary key(usuario_id, desde)
);
create table public.pensiones_pagos (
  usuario_id uuid not null references public.perfiles(id) on delete restrict,
  periodo date not null check (periodo between '2000-01-01' and '2200-12-01' and extract(day from periodo) = 1),
  categoria text not null check (categoria in ('universitario', 'profesional')),
  monto_centavos integer not null check (monto_centavos between 1 and 100000000),
  registrado_en timestamptz not null default now(),
  primary key(usuario_id, periodo)
);
create index pensiones_pagos_periodo_idx on public.pensiones_pagos(periodo);
comment on table public.pensiones_pagos is
  'Declaraciones definitivas de pago, propias e idempotentes. Monto y categoría son una copia histórica. Sin edición, borrado ni reversión para la aplicación.';
comment on table public.pensiones_participacion is
  'Vigencia de inclusión según rol y cuenta activa. Cambiar o desactivar una cuenta no reescribe meses anteriores. Las cuentas fuera_de_conteos solo afectan comidas.';

alter table public.pensiones_participacion enable row level security;
alter table public.pensiones_cuotas enable row level security;
alter table public.pensiones_pagos enable row level security;
revoke all on table public.pensiones_participacion, public.pensiones_cuotas, public.pensiones_pagos from public, anon, authenticated;
grant select on table public.pensiones_cuotas, public.pensiones_pagos to authenticated;
grant all on table public.pensiones_participacion, public.pensiones_cuotas, public.pensiones_pagos to service_role;
create policy "pensiones_cuotas: Director o propias" on public.pensiones_cuotas
  for select to authenticated using (
    (select public.mi_rol()) = 'director'
    or (usuario_id = (select auth.uid()) and (select public.mi_rol()) = 'residente')
  );
create policy "pensiones_pagos: Director o propios" on public.pensiones_pagos
  for select to authenticated using (
    (select public.mi_rol()) = 'director'
    or (usuario_id = (select auth.uid()) and (select public.mi_rol()) = 'residente')
  );

-- La misma exclusión mutua serializa cambio de cuota, participación y pago de una persona.
-- El trigger participa de la transacción de actualización del perfil y no cambia datos previos.
create function public.registrar_participacion_pensiones()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_incluido boolean := new.activo and new.rol in ('director', 'residente');
begin
  if tg_op = 'UPDATE' then
    if v_incluido = (old.activo and old.rol in ('director', 'residente')) then
      return new;
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.id::text, 19120000));
  insert into public.pensiones_participacion(usuario_id, desde, incluido)
    values(new.id, public.mes_actual_pensiones(), v_incluido)
    on conflict(usuario_id, desde) do update set incluido = excluded.incluido;
  return new;
end;
$$;
revoke all on function public.registrar_participacion_pensiones() from public, anon, authenticated;
create trigger perfiles_participacion_pensiones
  after insert or update of rol, activo on public.perfiles
  for each row execute function public.registrar_participacion_pensiones();
insert into public.pensiones_participacion(usuario_id, desde, incluido)
  select id, public.mes_actual_pensiones(), activo and rol in ('director', 'residente')
  from public.perfiles;

-- Función privada compartida por las tres RPC. Un pago conserva siempre su valor original,
-- incluso si fue adelantado y después cambia la cuota o la participación de ese mes.
create function public.valores_pension(p_usuario_id uuid, p_periodo date)
returns table(categoria text, monto_centavos integer, pagado_centavos integer, registrado_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select coalesce(p.categoria, case when i.incluido then c.categoria end),
    coalesce(p.monto_centavos, case when i.incluido then c.monto_centavos end),
    coalesce(p.monto_centavos, 0), p.registrado_en
  from (select 1) base
  left join public.pensiones_pagos p on p.usuario_id = p_usuario_id and p.periodo = p_periodo
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
revoke all on function public.valores_pension(uuid, date) from public, anon, authenticated;

create function public.guardar_cuota_pension(
  p_usuario_id uuid, p_desde date, p_categoria text, p_monto_centavos integer
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.mi_rol() is distinct from 'director' then
    raise exception 'Solo el Director puede editar las cuotas' using errcode = '42501';
  end if;
  if p_desde is null or extract(day from p_desde) <> 1
    or p_desde < public.mes_actual_pensiones() or p_desde > '2200-12-01'::date then
    raise exception 'Elegí el mes actual o uno futuro para la vigencia' using errcode = '22023';
  end if;
  if p_categoria is null or p_categoria not in ('universitario', 'profesional')
    or p_monto_centavos is null or p_monto_centavos not between 1 and 100000000 then
    raise exception 'Revisá la categoría y el monto de la cuota' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_usuario_id::text, 19120000));
  if public.mi_rol() is distinct from 'director' then
    raise exception 'La cuenta ya no puede editar las cuotas' using errcode = '42501';
  end if;
  if not exists(select 1 from public.perfiles where id = p_usuario_id and activo and rol in ('director', 'residente')) then
    raise exception 'La persona debe tener una cuenta activa de Residente o Director' using errcode = '22023';
  end if;
  insert into public.pensiones_cuotas(usuario_id, desde, categoria, monto_centavos)
    values(p_usuario_id, p_desde, p_categoria, p_monto_centavos)
    on conflict(usuario_id, desde) do update
      set categoria = excluded.categoria, monto_centavos = excluded.monto_centavos, modificado_en = now();
end;
$$;

create function public.mis_pensiones(p_anio integer)
returns table(periodo date, categoria text, monto_centavos integer, pagado_centavos integer, registrado_en timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.mi_rol() in ('director', 'residente'), false) then
    raise exception 'Solo podés consultar tus propias pensiones' using errcode = '42501';
  end if;
  if p_anio is null or p_anio not between 2000 and 2200 then
    raise exception 'Revisá el año' using errcode = '22023';
  end if;
  return query select make_date(p_anio, mes, 1), v.categoria, v.monto_centavos, v.pagado_centavos, v.registrado_en
    from generate_series(1, 12) mes
    cross join lateral public.valores_pension(auth.uid(), make_date(p_anio, mes, 1)) v
    order by mes;
end;
$$;

create function public.marcar_pensiones(p_periodos date[], p_montos_esperados integer[] default null)
returns setof public.pensiones_pagos
language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_periodo date;
  v_valor record;
  v_indice integer;
begin
  if not coalesce(public.mi_rol() in ('director', 'residente'), false) then
    raise exception 'Solo podés marcar tus propias pensiones' using errcode = '42501';
  end if;
  if p_periodos is null or cardinality(p_periodos) not between 1 and 12
    or exists(select 1 from unnest(p_periodos) p where p is null or extract(day from p) <> 1 or p not between '2000-01-01'::date and '2200-12-01'::date)
    or (select count(distinct p) from unnest(p_periodos) p) <> cardinality(p_periodos)
    or (p_montos_esperados is not null and cardinality(p_montos_esperados) <> cardinality(p_periodos)) then
    raise exception 'Elegí de uno a doce meses distintos y válidos' using errcode = '22023';
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
  end loop;
  insert into public.pensiones_pagos(usuario_id, periodo, categoria, monto_centavos)
    select v_usuario, p, v.categoria, v.monto_centavos
    from unnest(p_periodos) p cross join lateral public.valores_pension(v_usuario, p) v
    on conflict(usuario_id, periodo) do nothing;
  return query select p.* from public.pensiones_pagos p
    where p.usuario_id = v_usuario and p.periodo = any(p_periodos) order by p.periodo;
end;
$$;

create function public.presupuesto_pensiones(p_periodo date)
returns table(usuario_id uuid, etiqueta text, categoria text, monto_centavos integer, pagado_centavos integer, registrado_en timestamptz)
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
      v.categoria, v.monto_centavos, v.pagado_centavos, v.registrado_en
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
revoke all on function public.guardar_cuota_pension(uuid, date, text, integer) from public, anon;
revoke all on function public.mis_pensiones(integer) from public, anon;
revoke all on function public.marcar_pensiones(date[], integer[]) from public, anon;
revoke all on function public.presupuesto_pensiones(date) from public, anon;
grant execute on function public.guardar_cuota_pension(uuid, date, text, integer),
  public.mis_pensiones(integer), public.marcar_pensiones(date[], integer[]), public.presupuesto_pensiones(date) to authenticated;

-- Realtime sigue RLS. Administradora consulta solo el presupuesto autorizado y usa sondeo:
-- no se amplía el acceso a las filas crudas de pagos ni cuotas para recibir eventos.
alter publication supabase_realtime add table public.pensiones_pagos, public.pensiones_cuotas;
