-- =========================================================
-- Eventos que se repiten cada año (2/2): la serie anual no lleva día de la semana, ordinal ni día del mes
-- (el mes y el día salen de su fecha de inicio) y puede durar hasta 10 años; las demás siguen en 2.
-- =========================================================

alter table public.series_eventos drop constraint series_eventos_rango_valido;
alter table public.series_eventos drop constraint series_eventos_campos_de_patron;

alter table public.series_eventos
  add constraint series_eventos_rango_valido check (
    fecha_fin >= fecha_inicio
    and (fecha_fin - fecha_inicio) <= case when patron = 'anual' then 3660 else 730 end
  ),
  add constraint series_eventos_campos_de_patron check (
    (patron = 'semanal' and dia_semana is not null and ordinal_semana is null and dia_mes is null)
    or (patron = 'mensual_dia_fijo' and dia_mes is not null and dia_semana is null and ordinal_semana is null)
    or (patron = 'mensual_dia_semana' and dia_semana is not null and ordinal_semana is not null and dia_mes is null)
    or (patron = 'anual' and dia_semana is null and ordinal_semana is null and dia_mes is null)
  );
