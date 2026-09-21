-- =========================================================
-- Ausencias (1/2): el origen "ausencia" de una selección.
--
-- Una comida puede quedar cancelada porque la persona no estará en
-- la casa: no es una elección suya ("persona") ni su patrón
-- habitual ("plan"). Se distingue para poder decírselo en pantalla.
--
-- Va sola en su archivo: un valor nuevo de un enum no se puede usar
-- en la misma transacción que lo agrega, y la migración siguiente
-- sí lo usa.
-- =========================================================

alter type public.origen_seleccion add value if not exists 'ausencia';
