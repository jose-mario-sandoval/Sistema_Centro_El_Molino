# Ajustes tras el primer uso: mensajes, comidas de la casa y calendario — diseño

Nueve observaciones del usuario (2026-09-26) después de usar la plataforma, agrupadas en un solo spec
y entregadas en cinco PR. Cuatro son independientes entre sí (mensajes, desglose para
Administración, calendario, pantallas de comidas de la persona); la quinta ("La casa" del Director)
reutiliza piezas de las otras tres de comidas/calendario.

| # | Observación | PR |
|---|---|---|
| 1 | Administración no necesita aprobación de mensajes | 1 |
| 8 | Al aprobar, el Director ve el nombre (no solo siglas) | 1 |
| 9 | Director y Administración fijan mensajes (sin límite o por tiempo); aviso de pendientes | 1 |
| 5 | Administración no ve cuántos comen temprano, en bolsa, etc. | 2 |
| 3 | Calendario arriba; ausencias abajo, compactas, con vista de calendario | 3 |
| 2 | Plan de comida: editar desde la cuadrícula y quitar la lista de abajo | 4 |
| 4 | Semana: áreas pequeñas por día en vez de un gran scroll | 4 |
| 6 | El Director ve y cambia la semana de los demás | 5 |
| 7 | Subpestaña del Director: la tabla de Administración con nombres, edición y extras | 5 |

Hallazgo durante el análisis, incluido en el PR 1: **el aviso push de un mensaje pendiente ya le
llega a todos con el texto**, antes de que el Director lo apruebe (`lib/push/avisos.ts` no mira
`estado`).

## Decisiones tomadas con el usuario

1. Los mensajes de Administración se publican directo, como los del Director.
2. Fijar: Director y Administración, cualquier publicación aprobada; "hasta que lo quite", 1 día,
   3 días, 1 semana o hasta una fecha. Se muestran en una sección "Fijados" arriba del feed.
3. Semana de la persona: **tarjetitas por día** (no círculos ni carrusel).
4. Plan: **la cuadrícula es el editor**; se toca cada celda.
5. Ausencias: tarjeta compacta; "Marcar una ausencia" despliega un **mini calendario para marcar**
   (tocar primer y último día), que reemplaza los campos de fecha.
6. El Director cambia comidas de otros **con los mismos horarios de cierre** que todos.
7. El Director puede cambiar de otra persona: **semana, plan semanal y ausencias**. Consecuencia: el
   Director pasa a *ver* las ausencias de todos (hoy son privadas incluso para él).
8. La persona ve **"la cambió el Director"** cuando fue él.
9. Extra manual = día + comida + cantidad + **nota opcional para la cocina** (Administración ve la
   cifra y la nota, nunca nombres).

## 1. Mensajes (PR 1)

### Reglas

1. **Quién publica directo.** `mensajes_forzar_estado()`: en `INSERT`, `aprobado` si
   `mi_rol() in ('director','administracion')`, si no `pendiente` (con `mi_rol()` nulo — cuenta
   inactiva o llave secreta — sigue `pendiente`). En `UPDATE` de quien no es Director, vuelve a
   `pendiente` **solo si cambia el contenido** (texto, estado, motivo) o si corrige un rechazo
   (`old.estado = 'rechazado'`, aunque reenvíe el texto igual). Así fijar/desfijar no des-aprueba.
2. **Espejo en TS:** `publicaDirecto(rol)` en `lib/mensajes/feed.ts` (estado optimista y decisión
   de push).
3. **Fijar.** Columnas `fijado_en`, `fijado_hasta` (null = sin límite) y `fijado_por` en `mensajes`;
   solo publicaciones (`padre_id is null`) aprobadas. Se escriben únicamente con
   `fijar_mensaje(p_id, p_hasta)` / `desfijar_mensaje(p_id)` (`security definer`, rol Director o
   Administración con `coalesce(..., false)`; 42501 sin permiso, P0002 si no existe/no está aprobada o
   es respuesta, 22023 si el fin ya pasó). El `INSERT` anula `fijado_*`; si un mensaje deja de estar
   aprobado, se desfija. La hora de fin la calcula el servidor.
4. **Presentación.** Una publicación fijada vigente aparece **solo** en "Fijados" (no duplicada en la
   lista cronológica). El vencimiento lo resuelve la consulta (`fijado_hasta is null or > now()`) y
   el reloj del cliente (ya refresca cada 60 s). Quién fijó se muestra por **rol** ("por el
   Director", "por Administración"), nunca por nombre: Administración no ve nombres.
5. **Paginación.** `PaginaFeed` lleva un `cursor` explícito (el `creado_en` de la última fila
   cronológica), porque las fijadas mezcladas en el arreglo romperían `cursorAnteriores()`.
6. **Globito de pendientes** (solo Director): cantidad sobre la pestaña "Pendientes" y sobre
   "Mensajes" en la navegación. El layout no se vuelve a renderizar al navegar, así que el conteo
   inicial viene del servidor y lo mantiene vivo un proveedor cliente suscrito a `mensajes` (recuento
   con `head: true` y retardo). Número visible + texto para lector de pantalla.
7. **Push.** Solo cuando el mensaje queda `aprobado`: al publicar si `publicaDirecto`, o al aprobar
   (la transición `pendiente → aprobado` se hace con `.eq('estado','pendiente')` para que ocurra una
   vez). `avisos.ts` verifica además `estado` (y el del padre, en respuestas).
8. **Cola de moderación:** nombre real, rol y hora del autor (el Director ya recibe nombres).

## 2. Desglose para Administración (PR 2)

`DiaAgregado.resumen` ya trae `partes` por estado con horas agrupadas (`resumenComida()`); desde #17
la pantalla solo pinta `totalQueComen()`. Se vuelve a mostrar el desglose — sin nombres, así que no
cambia la regla de privacidad de #17.

1. Tablas de Semana y Plan de Administración **transpuestas**: filas = días, columnas = Desayuno /
   Almuerzo / Cena (siete columnas angostas no admiten desglose; en celular cada día es una tarjeta).
2. Celda = número grande "comen" + líneas por estado con icono + texto + color (`varsEstado`):
   temprano y tarde con horas ("2 temprano (06:30 ×2)"), en bolsa, enfermo (solo cantidad, nunca la
   nota), sí, no, sin definir. Extras debajo ("+N extra").
3. Componente de celda sin hooks, reutilizable dentro de un `<button>` (modo `spans`) para el PR 5.
4. Guardia de truncado (PostgREST `max_rows = 1000`) en las selecciones de la semana.

## 3. Calendario y ausencias (PR 3)

1. Orden: tarjeta del calendario primero, "Mis ausencias" después (Administración sigue sin ver
   ausencias).
2. Tarjeta compacta: una línea por ausencia próxima con "Quitar" (confirmación actual) y un botón
   "Marcar una ausencia" (`aria-expanded`) que despliega el mini calendario, el resumen en vivo
   ("Del 14 al 16 de octubre") y "Guardar ausencia" → `marcarAusencia` sin cambios.
3. Mini calendario (`components/ui/mini-calendario.tsx`, reutilizado en el PR 5): primer toque =
   desde, segundo = hasta (si es anterior, reinicia); un solo día es válido. Días pasados
   deshabilitados, días ya ausentes marcados (borde dorado discontinuo + icono + texto accesible),
   navegación por mes, teclado completo (flechas, Inicio/Fin, RePág/AvPág) con un solo punto de
   tabulación. No usa la clase `.cal-day`.
4. Etiquetas de fecha sin `Intl` del navegador (`lib/fechas/etiquetas.ts`), iguales en servidor y
   cliente.
5. **Excepción táctil documentada** (DESIGN.md §4): a 375px cada día mide ~39px de ancho × 56px de
   alto. Mitigaciones: alto completo, resumen escrito antes de guardar, ruta por teclado y lector.

## 4. Comidas de la persona (PR 4)

1. `SelectorComida` se separa en `PanelOpciones` (bandeja de 6 estados) + `EditorNota`; el mismo
   panel sirve en Plan, Semana y La casa (DESIGN.md §8).
2. **Plan:** cuadrícula 7 filas (días) × 3 columnas (comidas) a todo ancho; cada celda es un botón
   con icono + texto corto + color (+ hora), "Falta" si no está definida. Tocar abre el panel debajo
   de esa fila; una celda abierta a la vez. Se quita la lista de 21 filas. En celular el nombre del
   día va en su propia línea para que cada celda llegue a 56px.
3. **Semana:** 7 tarjetitas (2 columnas en celular, 4 desde 40rem, 7 desde 56rem) con nombre, fecha,
   Hoy/Ausente y tres líneas comida + icono + texto (nunca solo icono). Tocar una abre sus tres
   `ComidaDelDia` debajo de su fila. Hoy abierto por defecto en la semana actual; días pasados planos
   con candado y solo lectura.

## 5. "La casa" del Director (PR 5)

### Reglas

1. **Quién puede actuar por quién.** `puedo_gestionar_comidas_de(usuario)`: uno mismo si es Director
   o Residente; otra persona solo si quien llama es Director y el objetivo está activo con rol
   Director o Residente. Administración nunca.
2. **Mismos cierres.** Todo pasa por los mismos caminos `security invoker` + RLS, así que
   `comida_editable()` y el congelado aplican igual. Lo cerrado no se cambia.
3. **Quién cambió.** `selecciones_comida.modificado_por`, `plan_semanal.modificado_por` y
   `ausencias.creado_por`, llenados por trigger cuando `current_user = 'authenticated'` con
   `nullif(auth.uid(), usuario_id)` (null = la propia persona o el congelado). Los triggers **no**
   son `security definer`. La persona ve "la cambió el Director" / "La marcó el Director".
4. **Funciones.** `guardar_seleccion_de(p_usuario, …)` y `volver_a_plan_de(p_usuario, …)` con el
   cuerpo actual; `guardar_seleccion`/`volver_a_plan` pasan a envolverlas con `auth.uid()` (mismos
   códigos de error). Nombres nuevos, no sobrecarga (PostgREST y los tipos generados se confunden).
5. **Lectura.** El Director lee plan, selecciones y ausencias de todos. Administración sigue sin
   leer ausencias (solo `ausentes_en()`). Toda consulta que confiaba en "RLS solo me muestra lo
   mío" pasa a filtrar explícitamente por usuario (`listarAusenciasDe`, `quitarAusencia`).
6. **Congelado del plan.** Hoy editar `plan_semanal` entre el cierre de una comida y el cron cambia
   una comida ya contada; con el Director editando planes ajenos se agranda. Se agrega un trigger
   `before insert/update/delete` en `plan_semanal` que congela lo vencido de esa persona, mismo
   patrón que `ausencias`.
7. **Extras manuales.** Tabla `extras_manuales` (fecha, comida, cantidad 1–50, nota ≤ 200,
   creado_por). Solo el Director escribe (desde hoy). `extras_de_la_semana()` conserva su firma, suma
   enlace + manuales y responde a Administración y al Director; `extras_manuales_de_la_semana()`
   devuelve las notas sin autor. El formulario advierte "La cocina lee esta nota: no escribas
   nombres".

### Pantallas

- Subpestaña **"La casa"** (`/comidas/casa`, solo Director): navegación de semana; "Ver la semana
  de: [persona]"; tabla de la semana con el desglose del PR 2 donde cada celda es un botón que abre
  debajo "Almuerzo del miércoles 23/9" con las personas agrupadas por estado (nombres reales); cada
  nombre abre su comida editable en línea (solo lectura si cerró); "Agregar extra" y la lista de
  extras de la semana con "Quitar".
- **`/comidas/casa/[persona]`:** Semana (tarjetitas), Plan (cuadrícula) y Ausencias (mini
  calendario) de esa persona, con textos en tercera persona ("¿Va a almorzar…?", "según su plan",
  "Volver a su plan").

## Orden de entrega y migraciones

| PR | Rama | Migración |
|---|---|---|
| 1 | `claude/mensajes-admin-fijados` | `20260926100000_mensajes_administracion_fijados.sql` |
| 2 | `claude/admin-desglose-comidas` | — |
| 3 | `claude/calendario-ausencias-compacto` | — |
| 4 | `claude/comidas-cuadro-tarjetas` | — |
| 5 | `claude/comidas-la-casa` | `20260926110000_comidas_director.sql`, `20260926110100_extras_manuales.sql` |

- Mergear en orden de timestamp de migración. El código nuevo selecciona columnas nuevas: **aplicar
  la migración antes o junto con el merge**, o Vercel desplegará código que recibe 400.
- PR 1 y PR 5 regeneran `lib/supabase/database.types.ts` desde el artefacto del CI; PR 5 lo vuelve a
  regenerar tras rebasar sobre PR 1 (no mezclar a mano).
- PR 3 y 4 tocan el mismo test e2e de ausencias (`tests/e2e/comidas.spec.ts`); el segundo en
  mergearse se rebasa.

## Riesgos

- La nota de un extra es texto libre que llega a Administración: la única protección es el aviso
  del formulario.
- El mini calendario no llega a 56px de ancho en celular (excepción documentada).
- El Director gana también poder sobre las comidas de otro Director (el rol lo incluye, como pidió
  el usuario).
