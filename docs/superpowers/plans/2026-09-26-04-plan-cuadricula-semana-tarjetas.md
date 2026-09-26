# Plan editable en la cuadrícula y semana en tarjetas — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que la persona (Director, Residente) edite su plan semanal tocando la cuadrícula —sin la
lista de 21 filas de abajo— y que su semana deje de ser un gran scroll: siete tarjetitas por día que
resumen las tres comidas y se abren para cambiarlas.

**Arquitectura:** `SelectorComida` se separa en dos piezas sin estado propio de guardado,
`PanelOpciones` (bandeja de seis estados) y `EditorNota` (hora o nota), que usan Plan y Semana (y
después La casa, PR 5). El guardado del plan pasa a un hook `usePlanEditable(inicial)` con el mismo
flujo de `guardarPlan` y reversión optimista por celda. Todo lo que se puede probar sin navegador
(claves, textos cortos, etiquetas accesibles, qué día abrir) va a funciones puras en `lib/comidas/`.
Sin migraciones ni cambios de servidor.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Vitest (entorno node), Playwright.

**Referencias:** spec compartido `docs/superpowers/specs/2026-09-26-mensajes-comidas-calendario-design.md`
§4 (rama `claude/mensajes-admin-fijados`) · `DESIGN.md` §4 (táctil, anchos), §8 (una sola interacción),
§9 (sin definir), §12 (anclas e2e).

---

## Decisiones de esta pista

- **La cuadrícula del plan es el editor.** 7 filas (días) × 3 columnas (Desayuno, Almuerzo, Cena) a
  todo ancho. Cada celda es un `<button class="celda-plan">` con icono + texto corto + color
  (`varsEstado`), la hora en una segunda línea para temprano/tarde, y "Falta" con campana (`.vacia`)
  si no está definida. Una celda abierta a la vez; el panel va debajo de su fila, a todo ancho.
- **En el teléfono el nombre del día va en su propia línea** para que cada una de las tres celdas
  mida ~90px de ancho a 320px. El corte se decide con una *container query* en `rem`: a diferencia de
  una media query, el `rem` del contenedor sigue al tamaño de letra elegido, así con letra "Muy
  grande" la cuadrícula pasa antes al formato de teléfono.
- **La cabecera de comidas queda fija arriba** (`position: sticky`) mientras se recorre la
  cuadrícula: en el teléfono la semana no entra en una pantalla y la columna se pierde.
- **Semana: siete tarjetitas** (2 columnas en el teléfono, 4 y luego 7 según el ancho del contenedor,
  con umbrales en `rem` por la misma razón). Cada tarjeta: nombre, fecha, "Hoy"/"Ausente"/"Cerrado" y
  tres líneas comida + icono + texto corto (+ hora), nunca solo icono. Tocar abre `.panel-dia` con las
  tres `ComidaDelDia` debajo de la fila (`grid-column: 1 / -1` + `grid-auto-flow: dense`); una
  abierta a la vez; el orden de tabulación queda tarjeta → panel → tarjeta siguiente.
- **Qué día se abre solo:** en la semana en curso, hoy; si hoy ya cerró entero, el primer día
  siguiente que todavía tenga algo abierto (DESIGN §8: lo primero es algo que se puede cambiar). En
  otras semanas, ninguno.
- **Día cerrado = sus tres comidas cerradas** (no "fecha < hoy"): cubre días pasados, semanas pasadas
  y hoy después del cierre de la cena. Tarjeta plana, candado + "Cerrado", panel de solo lectura.
- **Mismas piezas, mismo comportamiento de nota que antes:** en Semana la nota se confirma con
  Guardar/Cancelar; en el Plan también se guarda al salir del campo si es válida (los cambios del
  plan "se guardan solos"). Las dos usan `EditorNota`.
- **Al abrir un panel que quedó fuera de la pantalla se desplaza lo justo** (`scrollIntoView` con
  `block: 'nearest'`, instantáneo con `prefers-reduced-motion`): tocar el domingo en un teléfono no
  puede abrir algo invisible.
- **Se conservan las anclas e2e** `.week-list` (ahora también `.tarjetas-semana`), `.estado-actual`,
  `.status-chip`, `[data-fecha][data-comida]`. Se quitan `.resumen-plan`, `.plan-lista`,
  `.dias-pasados` y la `.matriz` de solo lectura.

---

## Mapa de archivos

```
lib/comidas/tipos.ts                          + ETIQUETA_CORTA_ESTADO
lib/comidas/plan.ts                           nuevo: claveCelda, celdasDesdePlan, hayQueGuardar, etiquetaCelda
lib/comidas/vista.ts                          + textoCorto, lineasTarjeta, etiquetaTarjeta, diaCerrado, diaParaAbrir
tests/unit/comidas/plan.test.ts               nuevo
tests/unit/comidas/vista.test.ts              + casos de tarjetas
app/(app)/comidas/_componentes/panel-opciones.tsx   nuevo: bandeja de seis estados
app/(app)/comidas/_componentes/editor-nota.tsx      nuevo: hora o nota
app/(app)/comidas/_componentes/revelar.ts           nuevo: desplazar un panel recién abierto
app/(app)/comidas/_componentes/selector-comida.tsx  compone BotonEstado + PanelOpciones (API igual)
app/(app)/comidas/_componentes/comida-del-dia.tsx   usa EditorNota
app/(app)/comidas/_componentes/usar-plan-editable.ts nuevo: hook de guardado por celda
app/(app)/comidas/_componentes/plan-editable.tsx    la cuadrícula editable
app/(app)/comidas/_componentes/semana-persona.tsx   'use client', tarjetas + panel del día
app/(app)/comidas/plan/page.tsx                     texto de introducción
app/(app)/comidas/semana/page.tsx                   diaInicial, hrefSiguienteSemana, key por semana
app/globals.css                                     §5 comidas: cuadro y tarjetas; fuera lo viejo
DESIGN.md                                           §8 y §12
tests/soporte/medidas-e2e.ts                        nuevo: sin scroll lateral, alto mínimo
tests/e2e/comidas.spec.ts                           abrir el día antes de tocar comidas; plan; teléfonos
```

---

## Tareas

### Tarea 1: helpers puros del plan (`lib/comidas/plan.ts`) y etiqueta corta

- [ ] **Paso 1:** `tests/unit/comidas/plan.test.ts`: `claveCelda(2, 'almuerzo')` estable y distinta
  por día/comida; `celdasDesdePlan` aplana `PlanSemanal`; `hayQueGuardar` (igual → false, cambio de
  estado o nota → true, null ↔ valor → true); `etiquetaCelda` ("Martes, almuerzo: Comer temprano
  12:00. Cambiar" / "…: Falta, sin definir. Cambiar" / enfermo con su nota).
- [ ] **Paso 2:** correr `npm test -- plan` y ver que falla (módulo inexistente).
- [ ] **Paso 3:** implementar `plan.ts` y `ETIQUETA_CORTA_ESTADO` en `tipos.ts` (Sí, No, Temprano,
  Tarde, Bolsa, Enfermo).
- [ ] **Paso 4:** `npm test` verde. Commit.

### Tarea 2: helpers puros de las tarjetas (`lib/comidas/vista.ts`)

- [ ] **Paso 1:** en `vista.test.ts`: `textoCorto` (hora solo para temprano/tarde, "Falta" si null);
  `lineasTarjeta(dia)` (tres líneas en orden, con etiqueta de comida, estado, texto y hora);
  `diaCerrado` (todas cerradas); `etiquetaTarjeta` ("Miércoles 23/9, hoy, ausente. Desayuno: Sí. …");
  `diaParaAbrir` (hoy; si hoy cerró, el siguiente con algo abierto; null sin hoy o sin nada abierto).
- [ ] **Paso 2:** ver fallar. **Paso 3:** implementar. **Paso 4:** verde. Commit.

### Tarea 3: separar `SelectorComida` en `PanelOpciones` + `EditorNota`

- [ ] **Paso 1:** `panel-opciones.tsx`: `PanelOpciones({ id, nombre, marcado, pendiente, alElegir,
  alCerrar, editorNota?, acciones? })` — la bandeja `.opciones`, seis `.status-chip` con
  `aria-pressed`/`aria-disabled`, Escape y "Listo" llaman a `alCerrar` (quien abre devuelve el foco).
- [ ] **Paso 2:** `editor-nota.tsx`: `EditorNota({ tipo, etiqueta, valor, alCambiar, alGuardar,
  alCancelar?, alSalir?, pendiente, error?, enfocar? })`.
- [ ] **Paso 3:** `selector-comida.tsx` compone `BotonEstado` + nota + cierre + `PanelOpciones` con la
  misma API; `comida-del-dia.tsx` arma su nota con `EditorNota`.
- [ ] **Paso 4:** lint + typecheck + test. Commit.

### Tarea 4: la cuadrícula del plan

- [ ] **Paso 1:** `usar-plan-editable.ts`: `usePlanEditable(inicial)` → `{ valor, pendiente, guardar }`
  con `confirmado`/`pedido`/`ultimoGuardado` por clave (Map), `guardarPlan`, avisos "Plan semanal
  actualizado" y reversión si falla y no hubo otro guardado después.
- [ ] **Paso 2:** `plan-editable.tsx`: cabecera fija con las tres comidas (icono + texto); por día una
  `.cuadro-fila` con `.cuadro-dia` y tres `.celda-plan` (`aria-expanded`, `aria-controls`,
  `aria-label` de `etiquetaCelda`); el panel de la celda abierta (`.cuadro-panel`, pregunta +
  `PanelOpciones` + `EditorNota` + "Dejar sin definir") después de su fila. Fuera `ResumenPlan` y la
  lista.
- [ ] **Paso 3:** CSS `.cuadro-marco`, `.cuadro-plan`, `.cuadro-cabecera`, `.cuadro-fila`,
  `.cuadro-dia`, `.celda-plan` (abierta = hundida + borde; contraste alto = borde grueso),
  `.cuadro-panel`. Texto de `plan/page.tsx`.
- [ ] **Paso 4:** lint + typecheck + test. Commit.

### Tarea 5: la semana en tarjetas

- [ ] **Paso 1:** `semana-persona.tsx` pasa a cliente: `SemanaPersona({ dias, tipo, diaInicial,
  hrefSiguienteSemana })`; `.tarjetas-semana.week-list`; por día `<section aria-label="Miércoles 23/9">`
  con `button.tarjeta-dia` y, si está abierta, `.panel-dia` con las tres `ComidaDelDia`. Sin
  `.dias-pasados`. Se conservan el aviso de semana pasada y "Ver la semana que viene".
- [ ] **Paso 2:** `semana/page.tsx`: `diaInicial = tipo === 'actual' ? diaParaAbrir(dias) : null`,
  `hrefSiguienteSemana`, `key={lunes}`.
- [ ] **Paso 3:** CSS `.semana-marco`, `.tarjetas-semana`, `.tarjeta-dia` (abierta hundida, `.today`
  relieve alto, `.pasada` plana), `.tarjeta-comida`, `.panel-dia`; quitar `.dias-pasados`,
  `.resumen-plan`, `.plan-lista`, `.matriz*`.
- [ ] **Paso 4:** lint + typecheck + test. Commit.

### Tarea 6: DESIGN.md

- [ ] §8: "las mismas piezas (`PanelOpciones` + `EditorNota`) en Plan, Semana y después La casa";
  reemplazar "hoy va primero / días cerrados plegados" por "la semana en tarjetas por día, hoy
  abierto"; regla del plan en la cuadrícula. §12: componentes y anclas nuevas. Commit.

### Tarea 7: e2e

- [ ] `tests/soporte/medidas-e2e.ts`: `esperarSinScrollLateral(page)`, `esperarAltoMinimo(locator, 56)`.
- [ ] `comidas.spec.ts`: abrir la tarjeta del día (`.tarjetas-semana` → botón `^Miércoles 30/9`) antes
  de tocar `[data-fecha][data-comida]`; semana pasada = 7 tarjetas "Cerrado" y, al abrir una, 0
  `.estado-actual` habilitados; plan: martes almuerzo → "Comer temprano" 12:00 desde la cuadrícula
  (texto de la celda + fila en `plan_semanal`); `describe` a 320×640 y 375×812: sin scroll lateral y
  botones ≥ 56px en Plan y Semana. En el test de ausencias solo se agrega abrir el día (PR 3 cambia
  cómo se marca la ausencia en ese mismo test). Commit.

### Tarea 8: verificación visual y PR

- [ ] Render estático (react-dom/server + `globals.css`) con datos variados; capturas a 320, 375, 768 y
  1280 px, tema oscuro, contraste alto, letra grande y enorme, con una celda y una tarjeta abiertas.
  Sin scroll lateral, todo lo tocable ≥ 56px, texto legible.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`. Push, PR a `master`, CI en verde.
