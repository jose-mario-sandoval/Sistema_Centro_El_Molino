-- =========================================================
-- Nota opcional en "en bolsa" y "lonchera".
--
-- Hasta ahora solo temprano/tarde (hora) y enfermo (texto obligatorio) llevaban nota. Bolsa y lonchera
-- pasan a aceptar un texto libre de hasta 200 caracteres, pero la nota puede quedar sin escribir (null).
-- Una nota en blanco ('' o solo espacios) sigue siendo inválida: las funciones de guardado ya la
-- convierten en null con nullif(btrim(...), '') antes de validar.
--
-- Solo cambia la función: los CHECK de plan_semanal y selecciones_comida la llaman por nombre, y las filas
-- existentes de bolsa/lonchera (todas con nota null) siguen siendo válidas. 'lonchera' se creó en una
-- migración anterior, así que ya se puede usar acá.
-- =========================================================

create or replace function public.nota_valida(p_estado public.estado_comida, p_nota text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_estado in ('temprano', 'tarde')
      then coalesce(p_nota ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$', false)
    when p_estado = 'enfermo'
      then coalesce(btrim(p_nota) <> '' and length(p_nota) <= 200, false)
    when p_estado in ('bolsa', 'lonchera')
      then p_nota is null or (btrim(p_nota) <> '' and length(p_nota) <= 200)
    else p_nota is null
  end
$$;
