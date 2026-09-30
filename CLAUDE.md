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
  directo. Tampoco ve la comida persona por persona: su semana es agregada (cantidades por día y
  tiempo de comida, `agregarSemana()` en `lib/comidas/vista.ts`), y las cenas extra confirmadas por
  el enlace público llegan como una cifra aparte (`extras_de_la_semana()`), sin nombres ni lista de
  invitados.
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
- Eventos: `tipo_evento` = `san_rafael | san_gabriel | san_miguel | otro`; `requiere_otro_texto` es
  el pedido libre a Administración (`eventos_para_cocina()` también devuelve el evento si solo pide
  texto). Administración ve el pedido, nunca el título ni la categoría.
- **Series de eventos**: `series_eventos` + `eventos.serie_id`; cada ocurrencia es un evento normal
  (se edita/borra sola). `crear_serie_eventos()` NO es `security definer`: corre como quien llama,
  así RLS aplica fila a fila y la creación de serie + ocurrencias es atómica. Las fechas las calcula
  `lib/calendario/recurrencia.ts` (`generarFechasSerie`); la base solo valida el rango. "Cancelar la
  serie" borra las ocurrencias de hoy en adelante.
- **Enlace público de cena extra**: la única superficie sin sesión (`/confirmar-cena/[token]`).
  Toda ruta pública nueva hay que agregarla a `RUTAS_PUBLICAS` en `lib/supabase/proxy.ts`; si no,
  redirige a `/login` sin avisar. Escribe con `lib/supabase/publico.ts` (cliente anon) solo vía
  `info_enlace_confirmacion()` / `confirmar_cena_extra()` (`security definer`, error `MOL05`);
  `anon` no toca las tablas. Revocar = adelantar `vence_en`, no borrar (se perderían las
  confirmaciones ya recibidas).
- **Aprobación de mensajes** (`estado_mensaje`: pendiente/aprobado/rechazado): el estado lo fuerza el
  trigger `mensajes_forzar_estado` según el rol de *quien tiene la sesión* (`mi_rol()`), no según
  `autor_id` ni lo que mande el cliente. Residente → `pendiente`; Director → `aprobado`; el autor
  que corrige un rechazo vuelve a `pendiente`. Con la llave secreta (`admin`, sin `auth.uid()`) todo
  insert/update queda `pendiente` y ni un update con `admin` lo aprueba: en tests, sembrar con
  `admin` y aprobar con `(await clienteComo('director')).from('mensajes').update({ estado:
  'aprobado' })`; si no, RLS oculta el mensaje a quien no sea autor ni Director (así fallaron 6
  pruebas preexistentes de `mensajes` al introducirlo). Tiempo real: `leerEvento()` traduce
  también el `UPDATE` con `aplicarActualizacionMensaje()`; no reusar `aplicarInsercionMensaje()`
  (su idempotencia compara `creadoEn`, que un UPDATE no cambia).

## Migraciones: NO se aplican solas a producción

`.github/workflows/migraciones.yml` tiene `if: vars.SUPABASE_PROJECT_REF != ''`, y esa variable de
repositorio **no está definida** → el job siempre da "skipped" al mergear a `master`, silenciosamente.
Antes de dar por aplicada una migración, comprobar con
`gh run list --workflow "Migraciones producción"`.

Formas de aplicarla de verdad (documentado en README §"Reglas de trabajo"):
- `npm run db:aplicar` (usa `.env.local` — que apunta a **producción** — vía el Session pooler; no
  requiere Docker ni `supabase login`). Es la vía normal.
- A mano en el SQL Editor de Supabase, si por lo que sea `db:aplicar` no es viable. Ojo:
  `db:aplicar` es `supabase db push` y registra lo aplicado en `supabase_migrations.schema_migrations`;
  lo aplicado a mano **no queda registrado** y el próximo `db:aplicar` intentaría re-ejecutarlo y
  fallaría ("ya existe") bloqueando las migraciones nuevas. Tras aplicar a mano, registrarlas con
  `node node_modules/supabase/dist/supabase.js migration repair --status applied <timestamp>... --db-url
  <url del pooler>`, y comprobar con `npm run db:aplicar -- --dry-run` que no queda nada pendiente.
- Arreglar el workflow (definir `SUPABASE_PROJECT_REF` y los secretos) es una opción, pero ese mismo
  job corre `supabase config push`, que sube `[remotes.produccion]` de `config.toml` a Auth en
  producción — revisar que esté al día antes de activarlo.

Reglas al mergear varios PR con migraciones: en **orden de timestamp** del archivo (`supabase db
push`/`db:aplicar` rechazan una migración anterior a la última aplicada). Un `alter type ... add
value` a un enum va en su propia migración/ejecución: no se puede usar el valor nuevo en la misma
transacción que lo crea. Para *reemplazar* los valores de un enum (como `tipo_evento` en
`20260921190000_eventos_categorias.sql`) se evita el `add value`: renombrar el tipo viejo, crear el
nuevo con el nombre original, `alter column ... using` con el mapeo y borrar el viejo, todo en una
sola migración.

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
- La autorización para mergear es por PR: si el usuario pidió mergear ciertos PR, no mergear otros
  (aunque estén apilados y en verde) sin preguntarle de nuevo.
- Cuando un PR se apila sobre otro (mismos archivos) y el de abajo ya se mergeó, rebasar sobre
  `master` antes de pedir revisión, para que el diff muestre solo lo propio. Con squash, un simple
  `git rebase origin/master` descarta solos los commits ya incluidos ("patch contents already
  upstream"); `git rebase --onto master <rama-inferior> <rama-propia>` sirve si no los reconoce.
  Los conflictos típicos son dos ramas que agregaron un test o bloque al final del mismo archivo
  (`tests/e2e/calendario.spec.ts`, `tests/integration/calendario.test.ts`, `acciones.ts`,
  `modal-dia.tsx`): conservar ambos y cerrar bien el primer bloque (el marcador corta su `})`).
  Lint + typecheck + tests antes de `git push --force-with-lease`. `master` está checkeado en el
  worktree principal: en un worktree de Claude no se puede `git checkout master`.
- `ci.yml` solo corre en PR cuya base es `master` (y en push a master): un PR apilado sobre otra
  rama no tiene CI. Re-apuntarlo (`gh pr edit N --base master`) no lo dispara; cerrar y reabrir
  (`gh pr close N; gh pr reopen N`) sí.
- Windows/Git Bash: `git show origin/master:ruta` necesita `MSYS_NO_PATHCONV=1` (si no, bash
  reescribe la ruta). Al generar texto con Python desde bash, un `\b` en cadena no cruda queda como
  retroceso (0x08) en el archivo — usar `chr(92)` o escribir con la herramienta Write.
- Vercel Preview da "Internal Server Error": faltan las variables de Supabase en el scope Preview
  (no arreglado).

## Tipos de Supabase (`lib/supabase/database.types.ts`)

- Se regenera desde el CI, no a mano: el job `base-de-datos` sube el artefacto `database-types`.
  `rm lib/supabase/database.types.ts` y luego `gh run download <run-id> -n database-types -D
  lib/supabase` (sin borrar antes, `gh` falla con "ya existe"). Confirmar la rama con `git branch
  --show-current` antes de descargar.
- Hasta regenerarlo, `calidad` y "Build para e2e" fallan por columnas/RPC nuevas que el tipo no
  conoce: es esperado, no un bug de la rama (las pruebas de integración corren igual). Ojo: al
  regenerar pueden salir errores reales que el tipo viejo (`unknown`) tapaba.
- supabase-js infiere el tipo de fila leyendo el literal del `.select('...')`: mantenerlo un solo
  string literal; concatenar con `+` lo ensancha a `string` y rompe la inferencia.
- Los args de una RPC salen no-nulos aunque la función acepte null (Postgres no lo expone): castear
  en la llamada, como `guardar_seleccion` (`p_nota: nota as string`) y `crear_serie_eventos`.
- Un helper de test que devuelve un objeto literal sin anotar ensancha `estado: 'aprobado'` a
  `string`: anotar el tipo de retorno (`: MensajeFila`).

## Dónde está cada cosa

- `DESIGN.md` — sistema de diseño. `docs/prototipo/` — prototipo HTML de referencia.
- `docs/superpowers/specs/` — un documento de diseño por feature grande (el de ausencias es el más
  completo como modelo a seguir; `2026-09-21-eventos-mensajes-comidas-design.md` cubre categorías,
  enlace público, vista agregada, recurrencia y aprobación de mensajes, con un plan por
  subsistema en `docs/superpowers/plans/2026-09-21-0N-*.md`).
- `tests/soporte/usuarios-prueba.ts` — usuarios de prueba y clientes: `clienteAdminPrueba()`
  (llave secreta), `clienteComo(clave)` (sesión real, RLS aplica), `clienteAnonimoPrueba()`.
- `lib/<dominio>/` (comidas, calendario, ausencias, mensajes, perfiles, push) separa reglas (`reglas.ts`),
  vista/armado para UI (`vista.ts`), consultas a Supabase (`consultas.ts`) y validación zod
  (`lib/validacion/`).
- `app/(app)/<sección>/acciones*.ts` — Server Actions; usan `perfilParaAccion()` y, para escrituras
  que no debe hacer `authenticated` directamente, el cliente admin (`lib/supabase/admin.ts`).
