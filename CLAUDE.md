# Centro El Molino — guía para trabajar en este repo

Sistema interno del centro (comidas, mensajes, calendario, configuraciones). Lo usan personas
mayores no técnicas (residentes, director, un sacerdote) y Administración (cocina/limpieza), que
vive en otra parte de la casa y no ve ni oye al otro grupo. **Esta app es el único canal entre
ambos: si una pantalla confunde, no hay plan B.** Ver `README.md` para stack, scripts y reglas de
negocio básicas; esto complementa lo que el README no cubre.

## Diseño: neumorfismo accesible

Sistema de diseño en `DESIGN.md` (tokens, relieve, tipografía, contraste). Reglas que no son
opcionales:

- El relieve nunca comunica solo: elevado = tocable, hundido = elegido/campo, plano = solo lectura,
  y **siempre** con color + icono + texto encima. Sin eso, alguien con contraste alto o daltonismo
  se queda fuera.
- `data-theme` (claro/oscuro), `data-contraste` (alto quita el relieve por bordes sólidos) y
  `data-texto` (grande/enorme) son atributos en `<html>`; el driver está en `lib/apariencia.ts` +
  `components/ui/apariencia.tsx`. Se guardan en `localStorage` y, si hay sesión, también en la
  cuenta (columnas `apariencia_*` de `perfiles`) para que sigan a la persona entre dispositivos.
- Los seis tokens de estado de comida (`--st-<estado>` / `--st-<estado>-bg`) son un contrato: los
  interpola `estiloEstado()` en `comidas/_componentes/insignia-estado.tsx`. No renombrarlos.
- Un solo `app/globals.css`, sin Tailwind. Tamaño base 18px (`html{font-size:112.5%}`), todo en
  `rem`. Objetivo táctil mínimo 56px.
- Voseo salvadoreño en todos los textos ("Iniciá sesión", "Tocá un día").

## Modelo de datos y reglas de negocio

- Roles: `director`, `residente`, `administracion`. `ROLES_CON_COMIDAS = [director, residente]`;
  Administración no tiene comidas propias y **no debe conocer nombres** (solo siglas) ni títulos de
  eventos, en ninguna interfaz — pantallas, HTML, notificaciones push. El único punto de entrada de
  nombres es `listarPerfiles()` (`lib/perfiles/consultas.ts`) + `lib/perfiles/visibilidad.ts`;
  cualquier pantalla o payload nuevo para Administración debe pasar por ahí, no leer `nombre`
  directo.
- Valor efectivo de una comida, en cascada: **selección de la persona → ausencia → plan semanal →
  "Sin definir"**. Ver `lib/comidas/reglas.ts` (`valorEfectivo`) y el espejo en SQL
  (`guardar_seleccion`, `cerrar_comidas_vencidas`, `comidas_sin_definir`). Si cambia una regla,
  cambia en los dos lugares — hay una prueba que los compara.
- Un job de `pg_cron` (`cerrar_comidas_vencidas`, cada 5 min) congela lo vencido en
  `selecciones_comida` + `comidas_cerradas`; después de eso nada cambia. Cualquier tabla que pueda
  afectar el valor de una comida ya vencida (como `ausencias`) necesita un trigger que congele
  *antes* de la modificación — ver `docs/superpowers/specs/2026-09-21-ausencias-design.md` §"El
  congelado" para el porqué y el patrón a repetir.
- Privacidad: se refuerza en el servidor (nunca se manda al navegador lo que un rol no debe ver) y
  en la base cuando se puede (RLS + funciones `security definer` para exponer solo el resultado
  agregado, ej. `eventos_para_cocina()`, `ausentes_en()`). Límite conocido: `perfiles` sigue
  legible por la API de PostgREST para cualquier usuario activo — Administración no lo usa porque
  la app no se lo permite en pantalla, pero no hay una barrera de RLS que lo impida a nivel de fila.

## Migraciones: NO se aplican solas a producción

`.github/workflows/migraciones.yml` tiene `if: vars.SUPABASE_PROJECT_REF != ''`, y esa variable de
repositorio **no está definida** → el job siempre da "skipped" al mergear a `master`, silenciosamente.
Antes de dar por aplicada una migración, comprobar con
`gh run list --workflow "Migraciones producción"`.

Formas de aplicarla de verdad (documentado en README §"Reglas de trabajo"):
- `npm run db:aplicar` (usa `.env.local` — que apunta a **producción** — vía el Session pooler; no
  requiere Docker ni `supabase login`). Es la vía normal.
- A mano en el SQL Editor de Supabase, si por lo que sea `db:aplicar` no es viable.
- Arreglar el workflow (definir `SUPABASE_PROJECT_REF` y los secretos) es una opción, pero ese mismo
  job corre `supabase config push`, que sube `[remotes.produccion]` de `config.toml` a Auth en
  producción — revisar que esté al día antes de activarlo.

Reglas al mergear varios PR con migraciones: en **orden de timestamp** del archivo (`supabase db
push`/`db:aplicar` rechazan una migración anterior a la última aplicada). Un `alter type ... add
value` a un enum va en su propia migración/ejecución: no se puede usar el valor nuevo en la misma
transacción que lo crea.

## Probar SQL antes del PR

No hay Docker en esta máquina. Para probar migraciones y funciones `security definer`/RLS antes de
abrir el PR, hay un banco de pruebas en el scratchpad de la sesión (no en el repo): un PostgreSQL
real (Scoop, puerto 55432) con stubs de `auth`, roles (`anon`/`authenticated`/`service_role`) y
`cron`, para aplicar las migraciones reales y correr casos por rol. El CI (`base-de-datos`) hace
algo equivalente con Supabase local en Docker — ese job puede fallar por infraestructura del runner
("port already in use") sin que sea el código; relanzarlo (`gh run rerun --failed`) antes de asumir
que algo se rompió.

## Git / PR

- Ramas `feat/...` (o `claude/...`) desde `master`; PR con CI en verde; el repo mergea con
  **"Squash and merge"**.
- `gh pr merge` está bloqueado por los permisos de esta sesión de Claude Code — el merge lo hace el
  usuario desde GitHub, o Claude desde el navegador del usuario (Claude in Chrome) si lo pide
  explícitamente.
- Cuando un PR se apila sobre otro (mismos archivos) y el de abajo ya se mergeó, rebasar con
  `git rebase --onto master <rama-inferior> <rama-propia>` antes de pedir revisión, para que el
  diff muestre solo lo propio.
- Windows/Git Bash: `git show origin/master:ruta` necesita `MSYS_NO_PATHCONV=1` (si no, bash
  reescribe la ruta). Al generar texto con Python desde bash, un `\b` en cadena no cruda queda como
  retroceso (0x08) en el archivo — usar `chr(92)` o escribir con la herramienta Write.
- Vercel Preview da "Internal Server Error": faltan las variables de Supabase en el scope Preview
  (no arreglado).

## Dónde está cada cosa

- `DESIGN.md` — sistema de diseño. `docs/prototipo/` — prototipo HTML de referencia.
- `docs/superpowers/specs/` — un documento de diseño por feature grande (el de ausencias es el más
  reciente y el más completo como modelo a seguir).
- `lib/<dominio>/` (comidas, calendario, ausencias, perfiles, push) separa reglas (`reglas.ts`),
  vista/armado para UI (`vista.ts`), consultas a Supabase (`consultas.ts`) y validación zod
  (`lib/validacion/`).
- `app/(app)/<sección>/acciones*.ts` — Server Actions; usan `perfilParaAccion()` y, para escrituras
  que no debe hacer `authenticated` directamente, el cliente admin (`lib/supabase/admin.ts`).
