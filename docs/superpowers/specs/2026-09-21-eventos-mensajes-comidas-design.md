# Categorías de evento, recurrencia, enlace público, agregados de Administración y aprobación de mensajes: diseño

Cinco cambios relacionados, agrupados en un solo spec porque comparten dependencias reales: la
categoría de evento (1) es la base del enlace público de cena extra (3), y ese enlace alimenta la
cifra de "extra" en la vista agregada de Administración (4). La recurrencia (2) y la aprobación de
mensajes (5) son independientes del resto.

Código: `supabase/migrations/` (nuevas migraciones), `lib/calendario/`, `lib/comidas/`, `lib/mensajes/`,
`app/(app)/calendario/`, `app/(app)/comidas/`, `app/(app)/mensajes/`, y una ruta nueva sin
autenticación para el enlace público.

## 1. Categorías de evento y pedidos a Administración

Ya existe la base (PR #12): `eventos.tipo` (enum `tipo_evento`), `eventos.requiere_cocina`
(enum[] `requerimiento_cocina`), y `eventos_para_cocina()` — la función `security definer` que le
muestra a Administración solo fecha, hora y pedido, nunca título ni tipo. Este apartado ajusta
valores, no la arquitectura.

### Reglas acordadas

1. **Categorías.** `tipo_evento` pasa a ser exactamente `san_rafael | san_gabriel | san_miguel |
   otro`, reemplazando `retiro | charla | visita | reunion | otro`. Los eventos existentes con un
   tipo viejo quedan como `otro`.
2. **Pedido a Administración.** Se mantiene la lista fija actual (`merienda`, `comida`,
   `materiales`, con `materiales` excluyente de las otras dos — regla ya existente, sin cambios) y
   se agrega un campo de texto libre (`eventos.requiere_otro_texto`) para lo que no entra en la
   lista. El texto libre es independiente de la exclusividad de `materiales`: se puede combinar con
   cualquier valor del enum, o ir solo.
3. **`materiales` ya cubre "utensilios".** Su comentario actual en la base dice "vajilla, mesas,
   termos" — no se agrega un valor de enum nuevo, solo se ajusta la etiqueta visible a algo como
   "Utensilios y materiales" para que quede claro.
4. **Administración ve el pedido, nunca la categoría.** `eventos_para_cocina()` sigue sin devolver
   `titulo` ni `tipo`; ahora también devuelve `requiere_otro_texto`. Su filtro de "hay algo que
   preparar" pasa a ser `cardinality(requiere_cocina) > 0 or requiere_otro_texto is not null` (hoy
   solo mira `requiere_cocina`; un evento que *solo* pida algo por texto libre no debía
   desaparecer).

### Dónde vive cada regla

| Regla | En SQL | En TypeScript |
|---|---|---|
| Categorías | tipo `tipo_evento` (nueva migración, ver §6) | `TIPOS_EVENTO`, `ETIQUETA_TIPO` (`lib/calendario/tipos.ts`) |
| Pedido fijo + libre | columna `requiere_otro_texto`, `eventos_para_cocina()` | `ETIQUETA_REQUERIMIENTO`, `textoRequerimientos()`, `eventoParaAdministracion()` |

## 2. Recurrencia de eventos

No existe hoy: cada evento es una fila suelta en `eventos`. Se resuelve **materializando cada
ocurrencia como una fila normal de `eventos`**, ligada a una tabla `series_eventos` que guarda solo
el patrón. Esto evita construir un motor de recurrencia aparte: todo lo que ya existe para un
evento suelto (RLS, edición, borrado, `eventos_para_cocina()`) sigue funcionando sin tocarlo.

### Reglas acordadas

1. **Patrones soportados:** semanal en un día fijo, mensual en el mismo día del mes, mensual en el
   mismo día-de-semana del mes (ej. "el primer lunes"). No hay "cada N semanas".
2. **Fin obligatorio.** Toda serie tiene `fecha_fin`; no hay series indefinidas. Tope de 730 días
   desde `fecha_inicio` (mismo espíritu que el tope de 365 días de una ausencia), para no generar
   cientos de filas por accidente.
3. **Generación inmediata.** Al crear la serie se generan de una vez todas las filas de `eventos`
   entre `fecha_inicio` y `fecha_fin` según el patrón, cada una con `serie_id` apuntando a la
   serie. Como el rango es acotado, no hace falta un job ni generación diferida.
4. **Mensual en día fijo que no existe ese mes** (ej. el 31 en febrero): esa ocurrencia se omite ese
   mes, no se corre al día siguiente.
5. **Una ocurrencia puntual se edita o cancela como cualquier evento suelto** — `UPDATE`/`DELETE`
   directo sobre esa fila de `eventos`, usando las políticas de RLS que ya existen (solo Director).
   No se necesita una tabla de "excepciones": la fila materializada ya es la excepción si se toca.
6. **Cancelar la serie completa hacia adelante** borra las filas de `eventos` con ese `serie_id` y
   `fecha >= hoy` (las pasadas quedan intactas). Tampoco es una función nueva: es un `DELETE`
   filtrado por `serie_id`, permitido por la misma política de borrado del Director.
7. **Sin edición de serie.** Igual que ausencias ("para cambiar un rango se quita y se vuelve a
   marcar"), para cambiar el patrón de una serie se cancela hacia adelante y se crea una nueva. No
   hay `UPDATE` sobre `series_eventos`.

### Dónde vive cada regla

| Regla | En SQL | En TypeScript |
|---|---|---|
| Guardar el patrón | tabla `series_eventos` (solo INSERT/SELECT para Director) | — |
| Generar las fechas | — | `generarFechasSerie()`, nuevo en `lib/calendario/recurrencia.ts` |
| Ocurrencia puntual / serie completa | políticas ya existentes de `eventos` | acciones de servidor existentes de calendario, filtrando por `serie_id` |

## 3. Enlace público de confirmación de cena extra

Primera funcionalidad de la app que acepta una escritura **sin sesión**. Se crea desde un evento
del calendario (ej. "San Rafael — sábado"); el Director elige tiempo de comida y hora exacta de
vencimiento.

### Reglas acordadas

1. **Tablas nuevas:** `enlaces_confirmacion` (evento_id, tiempo_comida, vence_en, token único
   aleatorio, creado_por) y `confirmaciones_extra` (enlace_id, nombre, cantidad_personas 1–10).
   Ninguna de las dos es legible por Administración.
2. **Acceso público solo por dos funciones `security definer`**, otorgadas también a `anon`:
   - `info_enlace_confirmacion(token)`: devuelve los datos mínimos para mostrar el formulario
     (título del evento, fecha, tiempo de comida, si sigue vigente) o nada si el token no existe.
   - `confirmar_cena_extra(token, nombre, cantidad)`: valida que el token exista y no haya vencido
     (`now() < vence_en`) antes de insertar; si venció, falla con un error legible ("este enlace ya
     venció") en vez de insertar.
   Sin estas dos funciones, `anon` no tiene ningún privilegio sobre ninguna tabla — igual que hoy.
3. **El token es el único control de acceso**: aleatorio, 128 bits (`encode(gen_random_bytes(16),
   'hex')`), sin relación con el `id` interno del enlace. Debe fallar cerrado (sin insertar) si
   venció o no existe.
4. **Una confirmación cubre invitados.** El formulario público pide nombre + cantidad de personas
   (1–10); no requiere cuenta ni login.
5. **El Director ve la lista completa** (nombre + cantidad, por enlace) desde el evento.
   Administración nunca la ve — solo un total agregado (§4).
6. **Revocar un enlace antes de tiempo.** El Director puede adelantar `vence_en` (columna con
   `UPDATE` concedido solo a él) para invalidar el enlace de inmediato, reusando el mismo mecanismo
   de vencimiento — no hace falta una función ni un estado nuevos. A propósito no se borra la fila:
   borrarla arrastraría en cascada las confirmaciones ya recibidas, y esas cuentan igual para la
   cocina aunque el enlace se cierre antes.

### Dónde vive cada regla

| Regla | En SQL | En TypeScript |
|---|---|---|
| Vigencia y token | `enlaces_confirmacion`, `confirmar_cena_extra()` | página pública nueva `app/confirmar-cena/[token]/` |
| Lectura pública mínima | `info_enlace_confirmacion()` | — |
| Lista para el Director | RLS de `enlaces_confirmacion`/`confirmaciones_extra` (rol director) | vista del evento en `app/(app)/calendario/` |
| Revocar antes de tiempo | `grant update (vence_en)` + política de UPDATE para el Director | mismo componente de la lista |

**Detalle técnico nuevo:** la página pública necesita un cliente de Supabase sin cookies de sesión
(hoy todos los helpers de `lib/supabase/` asumen una sesión autenticada). Se agrega uno liviano solo
para este flujo.

## 4. Vista semanal agregada de Administración (comidas)

Reemplaza **dos** tablas persona-por-persona: `SemanaAdministracion` (selecciones del día) y
`PlanAdministracion` (plan habitual). Ambas muestran hoy nombre/sigla + comida por persona;
Administración solo necesita cantidades por día.

### Reglas acordadas

1. **Sin nombres ni filas por persona en el payload que llega al navegador de Administración.**
   `armarDiaAdministracion()` puede seguir calculando `filas` puertas adentro del servidor (las
   necesita para construir `resumen`), pero de ahí para afuera —lo que se manda al cliente— solo
   viaja `resumen` por día y por tiempo de comida. Mismo criterio para el plan habitual: se agrega
   una función nueva de conteo (no existe hoy porque `PlanAdministracion` siempre fue
   persona-por-persona).
2. **Una vista compacta de la semana completa**, no un día a la vez con selector: por cada tiempo de
   comida, cuántos desayunos/almuerzos/cenas hay confirmados cada día de la semana. El layout
   exacto (filas vs. columnas) se termina de ajustar mirándolo en el navegador durante la
   implementación, no es una decisión de datos.
3. **La lista "falta definir por persona" desaparece de Administración** (hoy la muestra
   `SemanaAdministracion`) — es información por persona, igual que la tabla que reemplaza.
4. **Las cenas extra del enlace público (§3) se muestran aparte**, no sumadas al total regular de
   esa comida ese día (ej. "12 confirmadas" + "3 extra" como dos cifras, no "15").

### Dónde vive cada regla

| Regla | En SQL | En TypeScript |
|---|---|---|
| Agregado de selecciones | sin cambios (`resumenComida()` ya agrega) | nueva función que descarta `filas` antes de cruzar al cliente |
| Agregado de plan habitual | — | nueva función de conteo sobre `PersonaConPlan[]`, análoga a `resumenComida()` |
| Extra del enlace público | consulta a `confirmaciones_extra` agrupada por fecha/tiempo_comida | se agrega a la vista semanal como cifra aparte |
| Componentes | — | reemplaza `SemanaAdministracion` y `PlanAdministracion` en `app/(app)/comidas/_componentes/` |

## 5. Aprobación de mensajes

Hoy cualquier usuario activo publica y se ve al instante (no hay `estado`, no hay `UPDATE`). Pasa a
requerir aprobación del Director para Residentes; el Director publica directo. Aplica también a
respuestas, no solo a publicaciones nuevas.

### Reglas acordadas

1. **Estado nuevo:** enum `estado_mensaje` (`pendiente | aprobado | rechazado`), columna
   `mensajes.estado not null default 'pendiente'`, más `motivo_rechazo text` opcional.
2. **El estado lo decide el servidor, no el cliente.** Un trigger `before insert` fuerza
   `estado := 'aprobado'` si quien publica es Director, o `'pendiente'` si no — sin importar qué
   mande el navegador. Mismo criterio en `update`: si quien edita no es Director, el trigger fuerza
   `estado := 'pendiente'` y limpia `motivo_rechazo`, para que el autor no pueda autoaprobarse
   editando.
3. **Quién ve qué:** el autor ve su propio mensaje en cualquier estado; todos ven los `aprobado`; el
   Director ve todo. Esto reemplaza la política de lectura actual, que hoy muestra todo a cualquier
   usuario activo. La misma regla se extiende a `reacciones`: hoy su política de lectura no mira el
   mensaje al que pertenecen, así que una reacción a un mensaje pendiente o rechazado quedaría
   visible igual (sin texto, pero delatando que ese mensaje existe). La política de `reacciones` pasa
   a exigir que el mensaje asociado sea visible para quien lee, con el mismo criterio de esta regla.
4. **El Director modera:** puede editar el texto de cualquier mensaje y cambiar su estado
   (aprobar/rechazar, con motivo opcional). No se marca visualmente que un mensaje fue editado por
   él — se publica igual que si lo hubiera escrito la persona.
5. **El autor corrige un rechazo:** solo puede editar su propio mensaje mientras está en
   `rechazado`; al guardar vuelve a `pendiente` automáticamente (regla 2). No puede editar un
   mensaje ya `aprobado` ni uno `pendiente` de otra persona.
6. **Administración no participa** de este chat (ni antes ni ahora): las políticas nuevas no le dan
   ningún acceso.
7. **Sin política de UPDATE hoy** — hay que agregarla (con `grant update (texto, estado,
   motivo_rechazo)`), cosa que la migración original de mensajes explícitamente no hacía ("los
   mensajes no se editan"). Esta spec reemplaza esa regla para el flujo de aprobación.
8. **Tiempo real sin cambios de infraestructura.** `mensajes` ya está en `supabase_realtime`;
   Postgres Changes respeta RLS, así que la política de lectura (regla 3) ya decide sola qué evento
   le llega a cada quien — nadie recibe el `INSERT` de un mensaje ajeno pendiente.

### Dónde vive cada regla

| Regla | En SQL | En TypeScript |
|---|---|---|
| Estado forzado por el servidor | triggers `before insert`/`before update` en `mensajes` | — |
| Quién ve qué | políticas SELECT/UPDATE de `mensajes` | `lib/mensajes/consulta-feed.ts`, `tiempo-real.ts` |
| Editar/reenviar/moderar | — | `app/(app)/mensajes/acciones.ts`, cola de pendientes nueva para el Director |

## 6. Migraciones: orden y separación

- El reemplazo de `tipo_evento` (§1) **no** usa `alter type ... add value` (eso exigiría su propia
  migración separada, por la regla ya documentada en `CLAUDE.md`). En vez de eso: renombrar el tipo
  viejo, crear el tipo nuevo con el mismo nombre, migrar la columna con un `using` que mapea todo a
  `'otro'`, soltar el tipo viejo — todo en una sola migración, porque es un tipo distinto, no un
  valor agregado a uno existente.
- El resto (`series_eventos`, `enlaces_confirmacion`, `confirmaciones_extra`, `estado_mensaje`) son
  tipos y tablas nuevas: sin esa restricción.
- Las cinco secciones pueden ir en PRs separados y mergearse en cualquier orden entre sí (solo §3
  depende de que §1 ya esté, y §4 puede mergear su parte de agregados antes de que exista §3, sin
  mostrar la cifra de "extra" hasta que sí exista). Dentro de cada PR, las migraciones se mergean en
  orden de su timestamp, como ya indica `CLAUDE.md`.

## Fuera de alcance

- Editar o cancelar "esta y las siguientes" ocurrencias de una serie — solo una ocurrencia puntual,
  o la serie completa hacia adelante.
- Notificaciones push para mensaje pendiente, mensaje rechazado o nueva confirmación de cena extra.
  La infraestructura de push ya existe (`lib/push/`); sería un buen siguiente paso pero no se pide
  acá.
- Límite de frecuencia o anti-abuso en el enlace público más allá de pedir nombre y validar
  vencimiento — alguien podría enviar varias confirmaciones seguidas.
- Registro de auditoría de ediciones o rechazos de mensajes (`registro_moderacion` sigue existiendo
  solo para borrados).

## Privacidad y límites conocidos

- El enlace público corre con el cliente `anon`: es la primera escritura de la app sin sesión. El
  token de 128 bits es el único control de acceso.
- Los nombres de `confirmaciones_extra` los ve solo el Director.
- `eventos` sigue siendo legible por completo (PostgREST) para cualquier `authenticated` con rol
  director/residente — límite ya conocido y documentado, sin cambios.

## Cómo se va a verificar

- Contra el banco de pruebas de PostgreSQL local: acceso por rol a cada tabla/función nueva
  (Director, Residente, Administración, `anon`); el reemplazo del enum sin perder eventos
  existentes; generación de fechas de los tres patrones de recurrencia (incluido el caso de fin de
  mes); vencimiento del enlace público justo antes/después de `vence_en`; el trigger de aprobación
  (incluida la ruta rechazo → edición → reenvío → aprobación) y que un no-Director no pueda
  autoaprobarse.
- E2E: Director crea un San Rafael recurrente semanal con pedido a cocina y genera un enlace de cena
  extra; alguien sin sesión confirma dos cenas por el link; Administración ve el agregado semanal
  con la cifra de extra aparte, sin nombres; un Residente escribe un mensaje, queda pendiente, el
  Director lo rechaza con motivo, el Residente lo edita y reenvía, el Director lo aprueba y aparece
  en el feed en tiempo real para todos.
