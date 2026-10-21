-- Una donación mensual de la casa, independiente de cuotas y abonos personales.
-- Las vigencias son compartidas; cada recepción conserva un snapshot definitivo.
create table public.pensiones_donaciones_configuracion (
  desde date primary key check (desde between '2000-01-01' and '2200-12-01' and extract(day from desde) = 1),
  monto_centavos integer not null check (monto_centavos between 1 and 100000000),
  modificado_por uuid not null references public.perfiles(id) on delete restrict,
  modificado_en timestamptz not null default now()
);
create table public.pensiones_donaciones_recepciones (
  periodo date primary key check (periodo between '2000-01-01' and '2200-12-01' and extract(day from periodo) = 1),
  monto_centavos integer not null check (monto_centavos between 1 and 100000000),
  recibido_en timestamptz not null default now(),
  registrado_por uuid not null references public.perfiles(id) on delete restrict
);
comment on table public.pensiones_donaciones_recepciones is
  'Una única recepción por mes para toda la casa. Monto, fecha y Director son un snapshot definitivo; sin edición, borrado ni reversión en la aplicación.';

alter table public.pensiones_donaciones_configuracion enable row level security;
alter table public.pensiones_donaciones_recepciones enable row level security;
revoke all on table public.pensiones_donaciones_configuracion, public.pensiones_donaciones_recepciones from public, anon, authenticated;
grant select on table public.pensiones_donaciones_configuracion, public.pensiones_donaciones_recepciones to authenticated;
grant all on table public.pensiones_donaciones_configuracion, public.pensiones_donaciones_recepciones to service_role;
create policy "donaciones_configuracion: solo Director" on public.pensiones_donaciones_configuracion
  for select to authenticated using ((select public.mi_rol()) = 'director');
create policy "donaciones_recepciones: solo Director" on public.pensiones_donaciones_recepciones
  for select to authenticated using ((select public.mi_rol()) = 'director');

create function public.guardar_donacion_pension(p_desde date, p_monto_centavos integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.mi_rol() is distinct from 'director' then
    raise exception 'Solo el Director puede configurar la donación' using errcode = '42501';
  end if;
  if p_desde is null or extract(day from p_desde) <> 1 or p_desde < public.mes_actual_pensiones()
    or p_desde not between '2000-01-01'::date and '2200-12-01'::date
    or p_monto_centavos is null or p_monto_centavos not between 1 and 100000000 then
    raise exception 'Revisá el monto y la vigencia de la donación' using errcode = '22023';
  end if;
  -- El mismo candado de casa serializa cambios y recepciones, incluso entre Directores.
  perform pg_advisory_xact_lock(20140000, 1);
  if public.mi_rol() is distinct from 'director' then
    raise exception 'La cuenta ya no puede configurar la donación' using errcode = '42501';
  end if;
  insert into public.pensiones_donaciones_configuracion(desde, monto_centavos, modificado_por)
    values(p_desde, p_monto_centavos, auth.uid())
    on conflict(desde) do update set monto_centavos = excluded.monto_centavos,
      modificado_por = excluded.modificado_por, modificado_en = now();
end;
$$;

create function public.donaciones_pensiones(p_anio integer)
returns table(periodo date, monto_centavos integer, recibido_en timestamptz, registrado_por uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.mi_rol() is distinct from 'director' then
    raise exception 'Solo el Director puede consultar las donaciones' using errcode = '42501';
  end if;
  if p_anio is null or p_anio not between 2000 and 2200 then
    raise exception 'Revisá el año' using errcode = '22023';
  end if;
  return query select make_date(p_anio, mes, 1), coalesce(r.monto_centavos, c.monto_centavos), r.recibido_en, r.registrado_por
    from generate_series(1, 12) mes
    left join public.pensiones_donaciones_recepciones r on r.periodo = make_date(p_anio, mes, 1)
    left join lateral (
      select configuracion.monto_centavos from public.pensiones_donaciones_configuracion configuracion
      where configuracion.desde <= make_date(p_anio, mes, 1)
      order by configuracion.desde desc limit 1
    ) c on true
    order by mes;
end;
$$;

create function public.recibir_donacion_pension(p_periodo date, p_monto_esperado integer)
returns table(periodo date, monto_centavos integer, recibido_en timestamptz, registrado_por uuid, nueva boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_recepcion public.pensiones_donaciones_recepciones;
  v_monto integer;
begin
  if public.mi_rol() is distinct from 'director' then
    raise exception 'Solo el Director puede registrar la donación recibida' using errcode = '42501';
  end if;
  if p_periodo is null or extract(day from p_periodo) <> 1
    or p_periodo not between '2000-01-01'::date and '2200-12-01'::date
    or p_monto_esperado is null or p_monto_esperado not between 1 and 100000000 then
    raise exception 'Revisá el período y el monto de la donación' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(20140000, 1);
  if public.mi_rol() is distinct from 'director' then
    raise exception 'La cuenta ya no puede registrar la donación' using errcode = '42501';
  end if;
  select r.* into v_recepcion from public.pensiones_donaciones_recepciones r where r.periodo = p_periodo;
  if found then
    -- Reintentar una respuesta perdida también conserva el monto/autor original.
    return query select v_recepcion.periodo, v_recepcion.monto_centavos, v_recepcion.recibido_en, v_recepcion.registrado_por, false;
    return;
  end if;
  select c.monto_centavos into v_monto from public.pensiones_donaciones_configuracion c
    where c.desde <= p_periodo order by c.desde desc limit 1;
  if v_monto is null then
    raise exception 'El período todavía no tiene una donación configurada' using errcode = '22023';
  end if;
  if v_monto is distinct from p_monto_esperado then
    raise exception 'La donación cambió. Revisá el monto antes de confirmar nuevamente' using errcode = '40001';
  end if;
  insert into public.pensiones_donaciones_recepciones(periodo, monto_centavos, registrado_por)
    values(p_periodo, v_monto, auth.uid()) returning * into v_recepcion;
  return query select v_recepcion.periodo, v_recepcion.monto_centavos, v_recepcion.recibido_en, v_recepcion.registrado_por, true;
end;
$$;

revoke all on function public.guardar_donacion_pension(date, integer), public.donaciones_pensiones(integer),
  public.recibir_donacion_pension(date, integer) from public, anon;
grant execute on function public.guardar_donacion_pension(date, integer), public.donaciones_pensiones(integer),
  public.recibir_donacion_pension(date, integer) to authenticated;

-- La lectura de cambios sigue RLS y solo llega a Directores. El sondeo existente cubre reconexiones.
alter publication supabase_realtime add table public.pensiones_donaciones_configuracion, public.pensiones_donaciones_recepciones;
