# Desglose para Administración — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** que Administración vuelva a ver, además de cuántos comen, **cómo** comen: cuántos
temprano y a qué hora, cuántos tarde, en bolsa, enfermos, cuántos no comen y cuántos faltan definir.
Sin nombres: el desglose ya viene agregado.

**Arquitectura:** no hay datos nuevos. `DiaAgregado.resumen` (de `agregarSemana()`) y
`resumenPlanSemanal()` ya traen `ResumenComida = { total, partes }` por comida, con las horas
agrupadas y sin nombres; desde #17 la pantalla solo pinta `totalQueComen()`. Se agrega una celda
reutilizable que pinta el número y las partes, y las dos tablas de Administración se transponen
(filas = días, columnas = comidas) para que la celda tenga ancho. Sin migración.

**Stack:** Next.js (App Router), TypeScript, Vitest (+ `react-dom/server` para la celda), Playwright.

**Referencias:** spec [`docs/superpowers/specs/2026-09-26-mensajes-comidas-calendario-design.md`](../specs/2026-09-26-mensajes-comidas-calendario-design.md)
§2 · plan de la vista agregada [`2026-09-21-03-vista-agregada-administracion.md`](2026-09-21-03-vista-agregada-administracion.md)
(por qué Administración no recibe `filas`) · DESIGN.md §2.3 (icono por estado), §8 (sin tablas con
scroll horizontal, sin tarjetas dentro de tarjetas), §12 (anclas de los E2E).

**Antes de empezar:** pruebas de integración y e2e solo en CI (Supabase en Docker).

---

## Decisiones de esta pista

- **Privacidad sin cambios.** Todo sale de `ResumenComida`, que no tiene nombres ni ids; la nota de
  "enfermo" nunca llega (solo la cantidad). La celda no recibe nada más.
- **Orden para la cocina** (`partesParaCocina()`): temprano, tarde, en bolsa, enfermo, sí, no, sin
  definir. Primero lo que cambia la preparación; `resumenComida()` conserva su orden fijo.
- **"no" pasa a "no come" / "no comen".** "1 no" suelto no se entiende. Solo afecta el texto de la
  parte (y `textoResumen`, que usan solo las pruebas).
- **El número va solo en `.conteo-numero`**, con "comen"/"come" en un elemento hermano: el E2E de
  ausencias hace `toHaveText('0')` sobre `.conteo-numero`.
- **`CeldaResumen` sin `'use client'` ni hooks**, con `como='spans'` para poder ir dentro de un
  `<button>` (PR 5): un botón no puede contener `<ul>`.
- **Tablas transpuestas**, misma clase `.admin-week-table` (ancla de los E2E y del apilado en
  teléfono). Celdas con `data-fecha`/`data-dia` + `data-comida` para los E2E y `data-et` para la
  etiqueta en el teléfono. El encabezado de fila usa `.namecell`, que el apilado ya trata como título
  de la ficha.
- **Guardia de truncado** también para `selecciones_comida` de la semana (PostgREST `max_rows =
  1000`), con un helper puro `exigirFilasCompletas()` que usan las tres guardias.

---

## Mapa de archivos

```
lib/comidas/resumen.ts                                          + partesParaCocina(); "no come/no comen"
lib/supabase/filas-completas.ts                                 nuevo — exigirFilasCompletas()
lib/comidas/consultas.ts                                        guardias con el helper, + selecciones
app/(app)/comidas/_componentes/celda-resumen.tsx                 nuevo — CeldaResumen
app/(app)/comidas/_componentes/semana-agregada-administracion.tsx transpuesta, usa CeldaResumen
app/(app)/comidas/_componentes/plan-agregado-administracion.tsx   transpuesta, usa CeldaResumen
app/globals.css                                                  §6 celda + apilado del teléfono
tests/unit/comidas/resumen.test.ts                               partesParaCocina, textos de "no"
tests/unit/comidas/vista.test.ts                                 textos de "no" si cambian
tests/unit/supabase/filas-completas.test.ts                      nuevo
tests/unit/comidas/celda-resumen.test.ts                         nuevo — renderToStaticMarkup
tests/e2e/comidas.spec.ts                                        selectores nuevos, desglose, Plan, 375px
```

---

## Tareas

### Tarea 1: `partesParaCocina()` y "no comen"

- [ ] Prueba: orden temprano → tarde → bolsa → enfermo → sí → no → sin definir; solo partes con
      cantidad; resumen vacío → `[]`; no muta el resumen.
- [ ] Prueba: "1 no come", "2 no comen" (actualizar las expectativas de `resumenComida` y
      `textoResumen`).
- [ ] Verla fallar, implementar, verla pasar. Commit.

### Tarea 2: `exigirFilasCompletas()` y guardia de selecciones

- [ ] Prueba: sin `count` (null) no lanza; `count === data.length` no lanza; `count > data.length`
      lanza con "llegaron N de M".
- [ ] Implementar en `lib/supabase/filas-completas.ts` (puro, sin `server-only`).
- [ ] `consultas.ts`: reemplazar las dos guardias de planes por el helper y agregar `{ count:
      'exact' }` + guardia a las selecciones de `obtenerSemanaParaAdministracion`. Commit.

### Tarea 3: `CeldaResumen`

- [ ] Pruebas con `renderToStaticMarkup`: número en `.conteo-numero` sin texto extra; "comen"/"come";
      partes en orden de cocina con icono (`svg.icono`) y `--c`/`--cbg`; "sin definir" con clase
      `sin-definir`; "+N extra"; `notas` en lista; `como='spans'` sin `ul`/`li`.
- [ ] Implementar. Commit.

### Tarea 4: tablas transpuestas

- [ ] `SemanaAgregadaAdministracion`: filas = días (`th.namecell scope=row` "Miércoles 23/9"),
      columnas Desayuno/Almuerzo/Cena; `td data-fecha data-comida data-et`.
- [ ] `PlanAgregadoAdministracion`: filas = "Lunes"…"Domingo"; `td data-dia data-comida data-et`.
- [ ] Lint + typecheck. Commit.

### Tarea 5: CSS

- [ ] Celda en escritorio: número + "comen" en una línea, partes en columna debajo.
- [ ] Teléfono (≤40rem): cada día es una ficha; cada comida, etiqueta a la izquierda y número a la
      derecha, partes debajo a todo el ancho. Nada de scroll lateral a 320px con letra "enorme".
- [ ] Revisar contraste alto (bordes de `.parte`) y tema oscuro. Commit.

### Tarea 6: E2E

- [ ] `td[data-et="Almuerzo …"]` → `td[data-fecha="…"][data-comida="almuerzo"]` (con `.conteo-numero`).
- [ ] El residente que eligió "Comer tarde 13:30" aparece como `1 tarde (13:30)`.
- [ ] Plan: el plan habitual del residente aparece en `td[data-dia="3"][data-comida="almuerzo"]`.
- [ ] 375×812: `scrollWidth <= innerWidth` en la Semana de Administración.
- [ ] Se conservan: sin "Persona" en la tabla, sin siglas, sin nombres en el HTML, sin /ausen/i.
      Commit.

### Tarea 7: verificación y PR

- [ ] `npm run lint`, `npm run typecheck`, `npm test`.
- [ ] Capturas (render estático + `globals.css`) a 320, 375 y 1280, con oscuro, contraste alto y
      letra enorme.
- [ ] PR a `master`, CI en verde.
