# Mensajes: Administración publica directo, fijados y aviso de pendientes — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** PR 1 del spec de ajustes tras el primer uso. Administración publica sin aprobación;
Director y Administración fijan publicaciones aprobadas (sin límite, 1/3/7 días o hasta un día) en
una sección "Fijados" arriba del feed; el Director ve un globito con la cantidad de pendientes en la
pestaña y en la navegación, y en la cola ve nombre, rol y hora del autor. Se corrige la fuga del aviso
push de mensajes pendientes.

**Arquitectura:** el estado lo sigue decidiendo `mensajes_forzar_estado()` (ahora también
`administracion` → `aprobado`; en `UPDATE` solo des-aprueba si cambia el contenido o se corrige un
rechazo). Las columnas `fijado_*` no tienen `grant update`: solo se escriben con
`fijar_mensaje()`/`desfijar_mensaje()` (`security definer`). El feed trae las fijadas vigentes en una
consulta aparte y las muestra solo arriba; la paginación pasa a un `cursor` explícito. El globito
arranca con un conteo del servidor en el layout y lo mantiene vivo un proveedor cliente suscrito a
`mensajes`.

**Stack:** Next.js 16 (App Router), TypeScript, supabase-js (Realtime), zod 4, Vitest, Playwright,
Postgres 17.

**Referencias:** spec [`docs/superpowers/specs/2026-09-26-mensajes-comidas-calendario-design.md`](../specs/2026-09-26-mensajes-comidas-calendario-design.md)
§1 · migraciones base `20260917125406_mensajes.sql` y `20260921220000_aprobacion_mensajes.sql` · plan
anterior `2026-09-21-05-aprobacion-mensajes.md`.

**Antes de empezar:** integración y e2e necesitan Supabase local (solo CI). El SQL se prueba antes en
el banco de Postgres del scratchpad (`montar.mjs`, base `banco_pr1`).

---

## Decisiones de esta pista

- **Códigos de error sin inventar:** `42501` sin permiso, `P0002` publicación inexistente / no
  aprobada / respuesta, `22023` fin ya pasado. La acción los traduce a texto.
- **`fijar_mensaje` devuelve `fijado_en`** (hora de la base); la acción devuelve además
  `fijado_hasta` (lo calculó el servidor) para actualizar el feed sin esperar al tiempo real.
  Volver a fijar una fijada reemplaza fin y autor (sirve para cambiar la duración).
- **`desfijar_mensaje` es idempotente**: desfijar algo ya desfijado no es error; `P0002` si no hay una
  publicación aprobada con ese id (también para pendientes/rechazados: la función no pasa por RLS y no
  debe delatar mensajes que Administración no ve).
- **`creado_en` lo pone la base** al publicar con sesión (una fecha futura quedaría primera para
  siempre); sin sesión (llave secreta, siembras) se respeta.
- **Check de consistencia:** fijada ⇒ publicación, aprobada y con fin posterior al inicio; no fijada ⇒
  las tres columnas nulas. El trigger desfija antes del check cuando el estado deja de ser aprobado.
- **"Hasta el día X"** = hasta la medianoche que termina ese día (hora de la casa). Se muestra como
  "hasta el jueves 1/10" (sin hora); con hora solo cuando el fin no es medianoche.
- **Fijada vigente = solo en "Fijados".** Al vencer o desfijarse vuelve a la lista cronológica en su
  lugar por fecha, aunque sea más vieja que la última página cargada (quien la desfijó la ve bajar).
- **Evento `UPDATE` de una publicación que no está cargada** (recién aprobada, una vieja fijada o
  quitada): no se inserta "pelada" (sin reacciones ni respuestas) ni se recarga todo (perdería las
  páginas anteriores): `leerEvento` avisa y el feed la trae sola con `cargarPublicacion(id)`.
- **Push:** `publicarMensaje`/`responderMensaje` solo programan el aviso si `publicaDirecto(rol)`;
  `moderarMensaje` aprueba con `.eq('estado','pendiente')` (una sola transición) y avisa ahí.
  `avisos.ts` además comprueba `estado` (y el del padre, en respuestas).
- **Globito:** número visible `aria-hidden` + texto para lector ("1 mensaje pendiente de
  aprobación"). Proveedor en el layout; `null` para quien no es Director (sin suscripción).
  `vigilarPendientes` recrea el canal con espera creciente si se cierra o falla `setAuth`; con la cola
  en pantalla, un cambio del número refresca la página.
- **Tipos:** `database.types.ts` se edita provisionalmente con el formato del generador para poder
  correr `typecheck` en local y se reemplaza por el artefacto del CI antes de pedir revisión.

---

## Mapa de archivos

```
supabase/migrations/20260926100000_mensajes_administracion_fijados.sql  nuevo — columnas, trigger, RPC
lib/supabase/database.types.ts                     columnas fijado_*, RPC (luego: artefacto del CI)
lib/mensajes/feed.ts                               tipos fijado, publicaDirecto, fijarPublicacion
lib/mensajes/fijados.ts                            nuevo — duraciones, vigencia, separar, texto
lib/mensajes/tiempo-real.ts                        filaMensaje con fijado_*, aviso de fijada no cargada
lib/mensajes/consulta-feed.ts                      COLUMNAS_FEED, consultarFijadas, cursor explícito
lib/mensajes/consultas.ts                          contarMensajesPendientes, columnas de pendientes
lib/validacion/mensajes.ts                         esquemaFijar, esquemaDesfijar
lib/push/avisos.ts                                 no avisa si no está aprobado
app/(app)/mensajes/acciones.ts                     push según estado, fijar/desfijar
app/(app)/mensajes/page.tsx                        globito en la pestaña Pendientes
app/(app)/mensajes/_componentes/feed-mensajes.tsx  sección Fijados, cursor, foco al mover
app/(app)/mensajes/_componentes/tarjeta-mensaje.tsx  Fijar (panel en línea), insignia, Quitar
app/(app)/mensajes/_componentes/cola-moderacion.tsx  nombre, rol y hora del autor
app/(app)/layout.tsx                               conteo inicial + ProveedorPendientes
components/app/pendientes.tsx                      nuevo — proveedor, hook, InsigniaConteo
components/app/navegacion.tsx                      globito en "Mensajes"
components/ui/iconos.tsx                           icono `fijar`
app/globals.css                                    .insignia-conteo, .seccion-fijados, .insignia-fijado, .panel-fijar
tests/unit/mensajes/{feed,fijados,tiempo-real,validacion,acciones}.test.ts
tests/unit/push/avisos.test.ts                     nuevo
tests/integration/mensajes.test.ts                 Administración directo, fijar/desfijar, feed con fijadas
tests/e2e/mensajes.spec.ts                         fijar/desfijar, globito, nombre en la cola
```

---

## Tareas

### Tarea 1: migración y banco de pruebas

- [ ] Escribir `20260926100000_mensajes_administracion_fijados.sql`: columnas `fijado_en`,
  `fijado_hasta`, `fijado_por` (FK a perfiles, `on delete set null`), check
  `mensajes_fijado_valido`, índice parcial, `create or replace` de `mensajes_forzar_estado()`,
  `fijar_mensaje(p_id, p_hasta)` y `desfijar_mensaje(p_id)` con `revoke ... from public, anon` y
  `grant ... to authenticated`. Sin tocar el `grant update (texto, estado, motivo_rechazo)`.
- [ ] Script `probar-fijados.mjs` en el scratchpad (base `banco_pr1`): insert de Administración →
  aprobado; de Residente → pendiente; Director/Administración fijan y el estado sigue aprobado;
  Residente o cuenta inactiva → 42501; pendiente o respuesta → P0002; fin pasado → 22023; cualquiera
  de los dos desfija; `update set fijado_en` directo → 42501 (grant de columna); insert con
  `fijado_en` → queda nulo; rechazar una fijada la desfija; reenviar un rechazo con el mismo texto →
  pendiente; Administración no cambia un pendiente ajeno (0 filas); llave secreta no aprueba.
- [ ] Tipos provisionales en `database.types.ts`.
- [ ] Commit.

### Tarea 2: dominio puro (TDD)

- [ ] `fijados.test.ts` (rojo): `fijadoHasta` para cada duración ("hasta el día" = medianoche
  siguiente en El Salvador), `estaFijada` con vencimiento, `separarFijadas` (orden por `fijadoEn`
  desc, sin duplicar en `resto`), `textoFijado` (sin límite / día / día y hora, con rol), `puedeFijar`.
- [ ] `feed.test.ts`: fixtures con `fijado_*`, `publicaDirecto`, `fijarPublicacion` idempotente,
  `aplicarActualizacionMensaje` lleva los campos y no inserta una fijada que no está cargada.
- [ ] `tiempo-real.test.ts`: `fijado_*` leídos, ausentes → null, tipos equivocados → evento ignorado,
  `publicacionFijada` en el UPDATE de una publicación fijada.
- [ ] `validacion.test.ts`: `esquemaFijar` (fecha obligatoria con `fecha`), `esquemaDesfijar`.
- [ ] Implementar hasta verde. Commit.

### Tarea 3: consultas

- [ ] `consulta-feed.ts`: columnas nuevas en el literal único, `consultarFijadas(supabase, ahora)`
  (vigentes, `fijado_en desc`, límite 20, respuestas completas como la página), `PaginaFeed` con
  `fijadas` (solo en la primera página) y `cursor` (`cursorAnteriores` de la parte cronológica).
- [ ] `consultas.ts`: `contarMensajesPendientes()` (`head: true`), columnas en pendientes.
- [ ] Commit.

### Tarea 4: push y acciones (TDD)

- [ ] `tests/unit/push/avisos.test.ts` (rojo): no envía para pendiente/rechazado ni respuesta con
  padre pendiente; sí para aprobado.
- [ ] `tests/unit/mensajes/acciones.test.ts` (rojo): publicar/responder programan `after` solo con
  `publicaDirecto`; moderar aprueba una sola vez (`estado = pendiente`), avisa publicación o
  respuesta, 0 filas → "ya fue moderado"; fijar calcula el fin con el reloj del servidor y traduce
  42501/P0002/22023; desfijar.
- [ ] Implementar hasta verde. Commit.

### Tarea 5: interfaz de mensajes

- [ ] Icono `fijar`. Cola: nombre + rol + hora.
- [ ] Feed: estado con fijadas mezcladas + `cursor`; sección "Fijados" (icono + texto) arriba, lista
  cronológica con `resto`; trae sola la publicación que llega sin estar cargada; foco en la tarjeta
  movida.
- [ ] Tarjeta: "Fijar" abre `.panel-fijar` en línea (radios en pastilla, fecha si corresponde,
  "Fijar arriba"/"Cancelar"); fijada muestra `.insignia-fijado` con rol de quien fijó y "Quitar de
  fijados".
- [ ] CSS con tokens existentes; contraste alto con bordes. Commit.

### Tarea 6: globito de pendientes

- [ ] `components/app/pendientes.tsx`; layout con conteo inicial (solo Director); navegación y
  pestaña "Pendientes". CSS `.insignia-conteo` (≥4.5:1 en los cuatro modos). Commit.

### Tarea 7: integración y e2e

- [ ] `tests/integration/mensajes.test.ts`: los casos del banco + `consultarPaginaFeed` con `fijadas`
  y `cursor`.
- [ ] `tests/e2e/mensajes.spec.ts`: Administración publica sin "Esperando aprobación"; Director fija
  "Por 1 día" → Residente la ve una vez bajo "Fijados"; Administración la quita; sin nombres para
  Administración; globito del Director en la pestaña y la navegación, que desaparece al aprobar;
  nombre real en la cola. Commit.

### Tarea 8: verificación y PR

- [ ] `npm run lint`, `npm run typecheck`, `npm test`; capturas (320/375/1280 × claro/oscuro/alto/enorme).
- [ ] PR con nota de migración; CI; reemplazar tipos por el artefacto `database-types`; CI verde.
