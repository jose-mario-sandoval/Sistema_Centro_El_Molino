-- =========================================================
-- Nuevo estado de comida: "lonchera" (la comida va empacada en recipientes que se pueden calentar).
-- Se diferencia de "bolsa" en cómo la empaca la cocina.
--
-- Va en su propia migración: un valor nuevo de un enum no se puede usar en la misma transacción que lo
-- crea. No necesita más cambios: nota_valida() ya trata cualquier estado sin regla propia como "sin nota".
-- =========================================================

alter type public.estado_comida add value if not exists 'lonchera' after 'bolsa';
