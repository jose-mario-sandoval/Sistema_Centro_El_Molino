-- =========================================================
-- La cuota mensual de una persona puede ser $0.00.
--
-- Hasta ahora una cuota debía valer al menos un centavo. Una cuota de cero significa "esta persona no
-- paga pensión desde ese mes": sigue siendo una cuota configurada (no aparece como "sin cuota"), no
-- deja nada pendiente y no registra pagos, porque marcar_pensiones* y registrar_abonos_pension solo
-- insertan abonos de al menos un centavo. No reemplaza a la exención por cuenta (pensiones_exencion).
--
-- Solo cambia la cuota. Los pagos (pensiones_pagos), los abonos y las donaciones siguen exigiendo
-- entre 1 y 100 000 000 centavos, y las cuotas ya guardadas siguen siendo válidas.
-- =========================================================

alter table public.pensiones_cuotas drop constraint pensiones_cuotas_monto_centavos_check;
alter table public.pensiones_cuotas
  add constraint pensiones_cuotas_monto_centavos_check check (monto_centavos between 0 and 100000000);

-- Igual que la definición original (20261019120000_pensiones.sql); solo el rango del monto pasa de 1 a 0.
-- Al ser create or replace conserva los permisos de ejecución ya otorgados.
create or replace function public.guardar_cuota_pension(
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
    or p_monto_centavos is null or p_monto_centavos not between 0 and 100000000 then
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
