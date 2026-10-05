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
  interpola `varsEstado()` en `comidas/_componentes/insignia-estado.tsx`. No renombrarlos. Igual los
  de tipo de evento (`--ev-<tipo>` / `-bg`, `varsTipo()` y `MARCA_TIPO` SR/SG/SM/Otro en
  `lib/calendario/tipos.ts`): el color siempre va con su marca escrita.
- Un solo `app/globals.css`, sin Tailwind. Tamaño base 18px (`html{font-size:112.5%}`), todo en
  `rem`. Objetivo táctil mínimo 56px. **Piso de letra `var(--t-xs)`**: nada más chico a ningún ancho
  ni tamaño elegido; si no cabe, cambia el layout, no la letra (las excepciones táctiles están
  numeradas en DESIGN.md §4).
- Cuántas columnas caben lo decide una **container query en `rem`** (sigue la letra elegida), no una
  media query (ahí `rem` = 16px siempre). Con `@supports not (container-type:inline-size)` de
  respaldo para iOS 15.
- **Una sola forma de editar una comida**: tocar la comida abre la burbuja junto a ella
  (`components/ui/burbuja.tsx` + `lib/burbuja.ts`; portal y posición por JS, sin Popover API, para
  que sirva en iOS 15), igual en Semana, Plan y La casa. Escape/"Cancelar" descartan; "Listo" o tocar
  fuera guardan una nota válida y, si es inválida, no cierran (`resolverBorrador` en
  `lib/comidas/notas.ts`). Nada escrito se pierde en silencio.
- Lo que depende del dispositivo antes de pintar va en un script de `<head>` en `app/layout.tsx`
  (apariencia, filtros del calendario, invitación a instalar): solo constantes, sin datos de
  usuario, y con una prueba que lo compara con la lógica en TS.
- Voseo salvadoreño en todos los textos ("Iniciá sesión", "Tocá un día"); tercera persona cuando el
  Director actúa por otra (`lib/comidas/voz.ts`).

## Modelo de datos y reglas de negocio

- Roles: `director`, `residente`, `administracion`. `ROLES_CON_COMIDAS = [director, residente]`;
  Administración no tiene comidas propias y **no debe conocer nombres** (solo siglas) ni títulos de
  eventos, en ninguna interfaz — pantallas, HTML, notificaciones push. El único punto de entrada de
  nombres es `listarPerfiles()` (`lib/perfiles/consultas.ts`) + `lib/perfiles/visibilidad.ts`;
  cualquier pantalla o payload nuevo para Administración debe pasar por ahí, no leer `nombre`
  directo. Tampoco ve la comida persona por persona: su semana es agregada (`agregarSemana()` en
  `lib/comidas/vista.ts`), con el desglose por estado y horas (`partesParaCocina()`, `CeldaResumen`:
  "2 temprano (06:30 ×2)", en bolsa, enfermo solo como cantidad) y los extras como cifra + nota
  (`extras_de_la_semana()` suma enlace público + manuales; `extras_manuales_de_la_semana()` da las
  notas sin autor), sin nombres ni lista de invitados. Tampoco ve colores, marcas ni filtros de
  categoría en el calendario, ni lee ausencias (solo `ausentes_en()`).
- Valor efectivo de una comida, en cascada: **selección de la persona → ausencia → plan semanal →
  "Sin definir"**. Ver `lib/comidas/reglas.ts` (`valorEfectivo`) y el espejo en SQL
  (`guardar_seleccion_de`, `cerrar_comidas_vencidas`, `comidas_sin_definir`). Si cambia una regla,
  cambia en los dos lugares. Ojo: la prueba de paridad (`tests/fixtures/casos-comidas.json`) solo
  cubre los cierres (`comida_editable` ↔ `estaAbierta`, `comida_sin_cerrar` ↔ `comidaSinCerrar`), no
  la cascada.
- Un job de `pg_cron` (`cerrar_comidas_vencidas`, cada 5 min) congela lo vencido en
  `selecciones_comida` + `comidas_cerradas`; después de eso nada cambia. Cualquier tabla que pueda
  afectar el valor de una comida ya vencida necesita un trigger que congele *antes* de la
  modificación: lo tienen `ausencias` y `plan_semanal` (este congela solo la celda que cambia).
  `congelar_comidas_de()` no toca comidas ya cerradas. Ver
  `docs/superpowers/specs/2026-09-21-ausencias-design.md` §"El congelado" para el patrón.
- **El Director gestiona las comidas de otros** ("La casa", `/comidas/casa`): semana, plan y
  ausencias de cualquier persona activa con comidas, **con los mismos cierres que todos**. Todo pasa
  por `puedo_gestionar_comidas_de(usuario)` (RLS) y por `guardar_seleccion_de` / `volver_a_plan_de`
  (`security invoker`; `guardar_seleccion`/`volver_a_plan` son envoltorios). Quién cambió queda en
  `selecciones_comida.modificado_por`, `plan_semanal.modificado_por` y `ausencias.creado_por`, que
  llenan triggers **no** `security definer` (`current_user = 'authenticated'`); la persona ve
  "Cambió el Director". En las acciones, el objetivo sale de `usuarioObjetivo()`
  (`lib/comidas/permisos.ts`), nunca de confiar en el `usuarioId` del cliente. **Como el Director
  lee las filas de todos, ninguna consulta puede confiar en que RLS le muestra "solo lo suyo"**:
  filtrar siempre por usuario (`listarAusenciasDe(id)`, `obtenerSemanaDe`, `obtenerPlanDe`).
- **Extras manuales** (`extras_manuales`, solo el Director): se agregan desde hoy aunque esa comida
  ya haya cerrado (con aviso), pero solo se quitan mientras `comida_sin_cerrar(fecha, comida)`.
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
  `autor_id` ni lo que mande el cliente. Residente → `pendiente`; **Director y Administración →
  `aprobado`** (espejo en TS: `publicaDirecto(rol)` en `lib/mensajes/feed.ts`). Quien no es Director
  devuelve el mensaje a `pendiente` solo si cambia el contenido o corrige un rechazo. Con sesión, el
  trigger también fija `creado_en := now()`. Con la llave secreta (`admin`, sin `auth.uid()`) todo
  insert/update queda `pendiente` y ni un update con `admin` lo aprueba: en tests, sembrar con
  `admin` y aprobar con `(await clienteComo('director')).from('mensajes').update({ estado:
  'aprobado' })`; si no, RLS oculta el mensaje a quien no sea autor ni Director. Tiempo real:
  `leerEvento()` traduce también el `UPDATE` con `aplicarActualizacionMensaje()`; no reusar
  `aplicarInsercionMensaje()` (su idempotencia compara `creadoEn`, que un UPDATE no cambia). Una
  publicación que no está cargada se trae completa con `cargarPublicacion(id)`, no se inserta pelada.
- **Fijar publicaciones** (Director y Administración): columnas `fijado_en` / `fijado_hasta` (null =
  sin límite) / `fijado_por`, **sin** `grant update`: solo las escriben las RPC `fijar_mensaje` /
  `desfijar_mensaje` (`security definer`). Una fijada vigente se muestra solo en "Fijados"; quién
  fijó se muestra por rol, nunca por nombre.
- **Avisos push** (`lib/push/`): siempre con `after()`, nunca al que hizo la acción, y respetando
  las preferencias de la cuenta (`perfiles.avisar_mensajes`, `avisar_hora_limite`, `avisar_cambios`,
  `avisar_cocina`). Un mensaje solo se avisa al público cuando queda `aprobado`; además: pendiente →
  Directores, aprobado/rechazado → autor, cambios del Director → la persona, cambios para la cocina →
  Administración. **Todo lo que va a Administración pasa por `paraCocina()`
  (`lib/push/cargas-casa.ts`)**: solo fecha, hora, cantidad y pedido. En producción dependen de las
  llaves VAPID y `CRON_SECRET` en Vercel y de `url_app` / `cron_secret` en Supabase Vault
  (`supabase/snippets/configurar-vault.sql`).
- **Filtros del calendario** (Director y Residente): por tipo, "Mis ausencias" y "solo con pedido a
  cocina"; en el cliente y por dispositivo (`lib/calendario/filtros.ts`). Lo oculto siempre deja
  rastro (aviso con "Mostrar todo", cuenta por día), y un evento recién guardado nunca desaparece.
- **Instalar la app** (`lib/pwa/`, `components/app/instalar.tsx` / `invitaciones.tsx`): franja en
  teléfonos y tablets mientras no corre instalada; `beforeinstallprompt` lo captura el script de
  `<head>` y es la prueba de que NO está instalada (borra la marca de "instalada").

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

**Cuándo aplicar respecto del merge** (Vercel despliega al mergear):
- El código nuevo que selecciona columnas nuevas da 400 sin la migración → aplicarla **antes o junto
  con** el merge. Una que solo agrega columnas con default se puede aplicar cuando sea.
- Una que **amplía RLS** va **justo antes** del merge, no días antes: con el código viejo expone
  datos (al dar lectura de `ausencias` al Director, el "Mis ausencias" viejo le mostraba las de
  todos hasta que llegó el código que filtra por usuario).

Reglas al mergear varios PR con migraciones: en **orden de timestamp** del archivo (`supabase db
push`/`db:aplicar` rechazan una migración anterior a la última aplicada). Un `alter type ... add
value` a un enum va en su propia migración/ejecución: no se puede usar el valor nuevo en la misma
transacción que lo crea. Para *reemplazar* los valores de un enum (como `tipo_evento` en
`20260921190000_eventos_categorias.sql`) se evita el `add value`: renombrar el tipo viejo, crear el
nuevo con el nombre original, `alter column ... using` con el mapeo y borrar el viejo, todo en una
sola migración.

## Probar SQL antes del PR

No hay Docker en esta máquina ni `.env.local` en los worktrees: las pruebas de integración y e2e
**solo corren en el CI**; localmente, `npm run lint`, `npm run typecheck`, `npm test` y el build.

Para probar migraciones y funciones `security definer`/RLS antes de abrir el PR hay un banco de
pruebas fuera del repo, en el scratchpad de una sesión anterior (buscar `banco/montar.mjs` bajo
`%TEMP%\claude\C--Users-Daniel-Desktop-SIstema-molino*\*\scratchpad\`): un PostgreSQL real (Scoop,
`~/scoop/apps/postgresql/current/bin`, puerto 55432, usuario `postgres`) con stubs de `auth`, roles
(`anon`/`authenticated`/`service_role`), `cron` y la publicación de realtime. `montar({ nombre,
archivos })` crea una base y aplica las migraciones del repo indicado en `RAIZ_REPO` (todas menos
push, que necesita Vault/pg_net); `comoUsuario(cliente, uuid, fn)` corre como esa persona. Si el
servidor no responde: `pg_ctl -D <scratchpad>/pg/data -o "-p 55432" start` (o `initdb -U postgres -A
trust` si no hay datos). Cada tarea usa su propio nombre de base.

Para ver pantallas sin backend: build con variables de prueba como el CI
(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=ci
SUPABASE_SECRET_KEY=ci`) y `next start` en un puerto libre para lo público (login, íconos); para lo
que pide sesión, un arnés fuera del repo con los componentes reales (esbuild + acciones simuladas) y
capturas con el chromium de Playwright a 320/375/768/1280 × claro/oscuro/alto contraste/letra enorme.

El CI (`base-de-datos`) usa Supabase local en Docker; puede fallar por infraestructura del runner
("port already in use", o `calidad` al bajar Google Fonts en el build) sin que sea el código:
relanzarlo (`gh run rerun <id> --failed`) antes de asumir que algo se rompió. PostgREST: un insert
de varias filas con claves distintas manda `null` en las que faltan (no el default) y rompe columnas
`not null` — en siembras de pruebas, dar las mismas claves a todas las filas.

## Git / PR

- Ramas `feat/...` (o `claude/...`) desde `master`; PR con CI en verde; el repo mergea con
  **"Squash and merge"**.
- `gh pr merge` está bloqueado por los permisos de esta sesión de Claude Code (lo rechaza aunque el
  usuario lo haya pedido; no buscarle la vuelta). El merge lo hace el usuario en GitHub con "Squash
  and merge": pasarle el enlace del PR cuando esté en verde y sin conflictos. Claude in Chrome sirve
  solo si lo pide y el navegador llega a GitHub (una vez no cargó), y el `gh` de su PowerShell no
  tiene sesión iniciada.
- La autorización para mergear es por PR: si el usuario pidió mergear ciertos PR, no mergear otros
  (aunque estén apilados y en verde) sin preguntarle de nuevo.
- **Varios PR en paralelo** chocan casi siempre en `app/globals.css`, `DESIGN.md`,
  `app/layout.tsx` y `tests/e2e/comidas.spec.ts` (cada uno agrega al final o en el mismo párrafo):
  conservar los dos lados. Antes de pedir el merge, simular el orden (`git merge-tree --write-tree
  --name-only A B`, o merges `--squash` en un worktree desechable) y decirle al usuario en qué orden
  van.
- **Squash + un PR que contiene a otro**: al mergear el de abajo, GitHub marca conflictos en el de
  arriba aunque el contenido sea el mismo (el commit squash es nuevo). Arreglo: `git merge
  origin/master` en la rama de arriba; si master ya está contenido (comparar `git rev-parse
  <ref>^{tree}`), quedarse con "ours" en los conflictos y **verificar que el árbol no cambió**
  respecto de la cabeza que ya pasó el CI — una mezcla automática puede duplicar bloques sin avisar
  (pasó en `tests/unit/comidas/notas.test.ts`). No encadenar `&& git push` antes de mirar ese diff.
  Cada actualización cuesta otro CI (~10 min): avisarlo.
- Tras un `git push`, `gh pr checks N --watch` puede terminar antes de que aparezcan los checks de
  Actions (solo ve Vercel): esperar el run con `gh run watch <id> --exit-status` y confirmar
  `calidad` y `base-de-datos`.
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
  subsistema en `docs/superpowers/plans/2026-09-21-0N-*.md`;
  `2026-09-26-mensajes-comidas-calendario-design.md` cubre mensajes de Administración y fijados,
  desglose para la cocina, mini calendario de ausencias, plan y semana, y "La casa", con planes
  `2026-09-26-0N-*.md`; filtros del calendario e instalar/avisos tienen plan propio
  `2026-09-29-*.md`). Las decisiones que salieron de revisar cada PR quedaron en su plan y en
  DESIGN.md §8 y §12 (qué clase es ancla de los E2E).
- Comidas: `app/(app)/comidas/_componentes/` (`semana-persona.tsx` tarjetas por día,
  `plan-editable.tsx` cuadrícula, `contenido-comida.tsx` + `panel-opciones.tsx` + `editor-nota.tsx`
  lo que va dentro de la burbuja, `celda-resumen.tsx` la celda agregada); `comidas/casa/` es "La
  casa" (`tabla-casa.tsx`, `burbuja-extra.tsx`, `[persona]/`).
- Calendario: `calendario/_componentes/` (`calendario-mes.tsx`, `modal-dia.tsx`,
  `filtros-calendario.tsx`, `panel-ausencias.tsx`); el mini calendario de rangos es
  `components/ui/mini-calendario.tsx` con su lógica en `lib/calendario/seleccion-rango.ts`. Nombres
  de meses y días sin `Intl` del navegador: `lib/fechas/etiquetas.ts`.
- Marca: `components/app/escudo.tsx` (escudo del Centro Cultural; el nombre va como texto) e íconos
  de la app en `components/app/monograma.tsx`; cambiar el logo = reemplazar
  `components/app/marca/escudo.png` y regenerar `escudo-datos.ts`.
- `tests/soporte/usuarios-prueba.ts` — usuarios de prueba y clientes: `clienteAdminPrueba()`
  (llave secreta), `clienteComo(clave)` (sesión real, RLS aplica), `clienteAnonimoPrueba()`.
- `lib/<dominio>/` (comidas, calendario, ausencias, mensajes, perfiles, push) separa reglas (`reglas.ts`),
  vista/armado para UI (`vista.ts`), consultas a Supabase (`consultas.ts`) y validación zod
  (`lib/validacion/`).
- `app/(app)/<sección>/acciones*.ts` — Server Actions; usan `perfilParaAccion()` y, para escrituras
  que no debe hacer `authenticated` directamente, el cliente admin (`lib/supabase/admin.ts`).
