-- El presupuesto usa una sola fuente para personas e ingresos compartidos de la casa.
-- No se crean perfiles, cuotas ni pagos personales para representar donaciones.
-- Se conserva la firma de entrada y la autorización de la RPC mensual, que también
-- utiliza la vista anual. La columna concepto distingue filas y evita contar personas
-- por el número total de conceptos económicos.
drop function public.presupuesto_pensiones(date);
create function public.presupuesto_pensiones(p_periodo date)
returns table(usuario_id uuid, etiqueta text, categoria text, monto_centavos integer, pagado_centavos integer, registrado_en timestamptz, exento boolean, concepto text)
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
    select filas.* from (
      -- Se mantienen las reglas de vigencia, exención y snapshots de abonos parciales.
      select p.id, case when v_rol = 'director' then p.nombre else p.siglas end as etiqueta,
        v.categoria, v.monto_centavos, v.pagado_centavos, v.registrado_en,
        public.pensiones_es_exento(p.id, p_periodo), 'pension'::text
      from public.perfiles p
      cross join lateral public.valores_pension(p.id, p_periodo) v
      where v.monto_centavos is not null or exists (
        select 1 from public.pensiones_participacion i
        where i.usuario_id = p.id and i.desde <= p_periodo and i.incluido
          and not exists(select 1 from public.pensiones_participacion posterior
            where posterior.usuario_id = p.id and posterior.desde > i.desde and posterior.desde <= p_periodo)
      )
      union all
      -- La PK de recepciones es el período: esta unión agrega exactamente una fila.
      -- Una recepción existente prevalece sobre la configuración actual para conservar
      -- tanto el presupuesto esperado como el ejecutado originales de ese mes.
      -- La consulta nunca filtra por fecha de recepción ni devuelve su autor a este rol.
      select null::uuid, 'Ingresos por donaciones'::text, null::text,
        coalesce(r.monto_centavos, c.monto_centavos), coalesce(r.monto_centavos, 0),
        r.recibido_en, false, 'donacion'::text
      from (select 1) casa
      left join public.pensiones_donaciones_recepciones r on r.periodo = p_periodo
      left join lateral (
        select configuracion.monto_centavos from public.pensiones_donaciones_configuracion configuracion
        where configuracion.desde <= p_periodo order by configuracion.desde desc limit 1
      ) c on true
    ) filas
    order by filas.etiqueta, filas.id;
end;
$$;
revoke all on function public.presupuesto_pensiones(date) from public, anon;
grant execute on function public.presupuesto_pensiones(date) to authenticated;
comment on function public.presupuesto_pensiones(date) is
  'Conceptos del presupuesto mensual: pensiones por UUID e ingreso por donaciones de la casa sin usuario. Administradora recibe solo siglas y nunca el autor de la recepción. La vista anual suma estas mismas filas, sin sumar donaciones otra vez.';
