-- =========================================================
-- Apariencia por persona (DESIGN.md §5): tema, contraste y tamaño
-- de letra, para que sigan a la cuenta entre dispositivos.
--
-- Solo agrega columnas opcionales: es seguro aplicarla sobre los
-- datos reales. Nulo = la persona nunca eligió; en ese caso decide
-- el dispositivo (por ejemplo prefers-contrast del sistema).
-- Las escribe la app con la llave secreta (como los avisos): no se
-- concede UPDATE a `authenticated`.
-- =========================================================

alter table public.perfiles
  add column apariencia_tema text
    constraint perfiles_apariencia_tema_valida
    check (apariencia_tema in ('auto', 'claro', 'oscuro')),
  add column apariencia_contraste text
    constraint perfiles_apariencia_contraste_valida
    check (apariencia_contraste in ('suave', 'alto')),
  add column apariencia_texto text
    constraint perfiles_apariencia_texto_valida
    check (apariencia_texto in ('normal', 'grande', 'enorme'));

comment on column public.perfiles.apariencia_tema is 'Tema elegido: auto, claro u oscuro. Nulo = sin elegir.';
comment on column public.perfiles.apariencia_contraste is 'Contraste elegido: suave o alto. Nulo = sin elegir (decide el dispositivo).';
comment on column public.perfiles.apariencia_texto is 'Tamaño de letra elegido: normal, grande o enorme. Nulo = sin elegir.';
