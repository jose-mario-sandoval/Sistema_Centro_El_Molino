-- =========================================================
-- Preferencias de avisos nuevas (plan 2026-09-29-instalar-y-avisos):
--   avisar_cambios: la persona recibe un aviso cuando el Director
--     cambia una comida suya, su plan o sus ausencias (roles con
--     comidas).
--   avisar_cocina: Administración recibe un aviso cuando cambia algo
--     para la cocina (extras manuales y pedidos de eventos).
--
-- Solo agrega columnas con valor por defecto: es seguro aplicarla
-- sobre los datos reales (todas las cuentas quedan en true, como
-- avisar_mensajes y avisar_hora_limite al crearse).
-- Igual que las demás avisar_*: `authenticated` solo lee `perfiles`
-- (select de tabla); las escribe la app con la llave secreta después
-- de perfilParaAccion(), siempre sobre la fila de la sesión.
-- =========================================================

alter table public.perfiles
  add column avisar_cambios boolean not null default true,
  add column avisar_cocina boolean not null default true;

comment on column public.perfiles.avisar_cambios is
  'Aviso push cuando el Director cambia una comida, el plan o una ausencia de esta persona.';
comment on column public.perfiles.avisar_cocina is
  'Aviso push de cambios para la cocina (extras manuales, pedidos de eventos). Lo usa Administración.';
