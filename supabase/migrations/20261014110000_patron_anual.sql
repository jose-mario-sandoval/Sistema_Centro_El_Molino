-- =========================================================
-- Eventos que se repiten cada año: nuevo patrón de recurrencia "anual".
--
-- Va en su propia migración: un valor nuevo de un enum no se puede usar en la misma transacción que lo
-- crea (las restricciones que lo usan están en 20261014110100_series_anuales.sql).
-- =========================================================

alter type public.patron_recurrencia add value if not exists 'anual' after 'mensual_dia_semana';
