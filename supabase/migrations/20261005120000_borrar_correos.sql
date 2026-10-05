-- =========================================================
-- Cuentas: `perfiles` deja de guardar correos.
--
-- Desde la migración 20261005110000 se entra con `perfiles.usuario` y nada lee ni escribe
-- `perfiles.correo`. Aplicar DESPUÉS de comprobar en producción que la gente entra con su usuario
-- y de correr `npm run borrar-correos -- --confirmar` (que reemplaza en Auth los correos reales por
-- direcciones internas): hasta este paso, la columna sirve para restaurar una dirección.
--
-- Al borrar la columna se van con ella su restricción de unicidad y su check de minúsculas.
-- =========================================================

alter table public.perfiles drop column correo;
