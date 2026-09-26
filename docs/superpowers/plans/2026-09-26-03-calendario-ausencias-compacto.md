# Calendario arriba y ausencias compactas con mini calendario — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** en `/calendario`, la tarjeta del mes pasa primero y "Mis ausencias" queda debajo como una
tarjeta compacta: una línea por ausencia próxima (con "Quitar" y su confirmación de siempre) y un
botón "Marcar una ausencia" que despliega un **mini calendario para marcar** (tocar el primer y el
último día) en lugar de los dos campos de fecha. Los días ya marcados se ven en el mini calendario.

**Arquitectura:** sin migración ni cambios de servidor: la acción `marcarAusencia` recibe los mismos
campos `desde`/`hasta` (ahora ocultos). La lógica de selección, teclado y límites vive en funciones
puras (`lib/calendario/seleccion-rango.ts`) y el componente `components/ui/mini-calendario.tsx` es una
capa fina sobre ellas, reutilizable por el PR 5 (ausencias de otra persona). Las etiquetas de fecha
dejan de depender de `Intl` (`lib/fechas/etiquetas.ts`) para que servidor y navegador digan lo mismo.

**Stack:** Next.js 16 (App Router), React 19, TypeScript, Vitest, Playwright.

**Referencias:** spec [`docs/superpowers/specs/2026-09-26-mensajes-comidas-calendario-design.md`](../specs/2026-09-26-mensajes-comidas-calendario-design.md)
§3 (en la rama del PR 1) · [`2026-09-21-ausencias-design.md`](../specs/2026-09-21-ausencias-design.md)
(reglas: un solo día es `desde = hasta`, hasta 365 días, no se registra lo que ya pasó) · `DESIGN.md`
§4 (objetivos táctiles), §5 (contraste alto), §8 (sin tarjetas dentro de tarjetas, sin modales), §12.

---

## Decisiones de esta pista

- **Días de otros meses en blanco**, no atenuados: celdas vacías que conservan las siete columnas. Con
  días de 36–43px de ancho, un "3" atenuado de octubre al lado del 30 de septiembre confunde más de
  lo que ayuda. Las semanas sin ningún día del mes no se dibujan (4–6 filas, no siempre 6).
- **Límites:** de hoy a hoy + `DIAS_MAXIMOS_AUSENCIA` (365). Como el primer día nunca es anterior a
  hoy, un rango elegido en el mini calendario nunca supera el máximo; igual se valida en la selección
  (mensaje amable) porque el PR 5 puede pasar otros límites, y el servidor lo vuelve a exigir.
- **Días ya ausentes** se pueden tocar (la base admite rangos que se solapan: sirve para alargar una
  ausencia); se ven con el lenguaje de `.cal-day.ausente` (borde dorado discontinuo + valija) y su
  nombre accesible dice "ya marcado como ausente".
- **Resumen en vivo** con `rangoLegible` más la cantidad de días ("Del 14 al 16 de octubre (3 días)"):
  la cantidad desambigua un rango que cruza de año, que `rangoLegible` escribe sin año.
- **Sin `.cal-day`** ni `data-fecha` suelto: los días son `.mini-calendario .mini-dia[data-fecha]`, así
  los E2E del calendario grande (`.cal-day[data-fecha=…]`) siguen encontrando un único elemento.
- **Navegación de mes con `aria-disabled`**, no `disabled`: al llegar al último mes el botón no pierde
  el foco del teclado (DESIGN.md §10).
- **`<table role="grid">`** (patrón APG de selector de fecha): los lectores de pantalla pasan a modo foco
  y las flechas llegan al componente; un solo punto de tabulación (tabindex itinerante).

## Mapa de archivos

```
lib/fechas/etiquetas.ts                                    nuevo — MESES, DIAS_SEMANA, etiquetaMesLarga, etiquetaDiaLarga (sin Intl)
lib/fechas/rango.ts                                        usa MESES de etiquetas.ts
lib/calendario/cuadricula.ts                               etiquetaMes/etiquetaDia delegan en etiquetas.ts (sin Intl)
lib/calendario/seleccion-rango.ts                          nuevo — selección, teclado, límites, resumen (puro)
components/ui/mini-calendario.tsx                          nuevo — el mini calendario ('use client')
components/ui/boton-envio.tsx                              + prop opcional `deshabilitado`
app/(app)/calendario/_componentes/panel-ausencias.tsx      tarjeta compacta + formulario con el mini calendario
app/(app)/calendario/page.tsx                              calendario primero, ausencias después
app/globals.css                                            .panel-ausencias compacta, .mini-calendario, .mini-dia
DESIGN.md                                                  §4 segunda excepción táctil · §12 pieza y ancla nuevas
tests/unit/fechas/etiquetas.test.ts                        nuevo — iguala a la salida anterior con Intl
tests/unit/calendario/seleccion-rango.test.ts              nuevo
tests/unit/calendario/mini-calendario.test.ts              nuevo — render estático (react-dom/server)
tests/e2e/soporte/ausencias.ts                             nuevo — helper marcarAusencia(page, desde, hasta?)
tests/e2e/comidas.spec.ts                                  la prueba de ausencia usa el helper
tests/e2e/calendario.spec.ts                               + rango que cruza de mes, días pasados, Administración
```

---

## Tareas

### Tarea 1 — Etiquetas de fecha sin `Intl`

- [x] Prueba `tests/unit/fechas/etiquetas.test.ts`: `etiquetaMesLarga('2026-09')` = "Septiembre de 2026",
  `etiquetaDiaLarga('2026-09-16')` = "Miércoles, 16 de septiembre de 2026", y **para cada día de
  2026–2028** la salida es idéntica a la del formateador `Intl` que se usaba (definido en la prueba).
- [x] Verla fallar (módulo inexistente).
- [x] Implementar `lib/fechas/etiquetas.ts` con `MESES`, `DIAS_SEMANA` (lunes primero) y `diaSemana`.
- [x] `cuadricula.ts`: `etiquetaMes`/`etiquetaDia` delegan (se van el `Intl` y sus imports);
  `rango.ts` usa `MESES`. Pruebas de `cuadricula` y `rango` siguen verdes.
- [x] Commit.

### Tarea 2 — Selección de rango y teclado (puro)

- [x] Pruebas `tests/unit/calendario/seleccion-rango.test.ts`:
  - `tocarDia`: 1.º toque = desde; 2.º ≥ desde = hasta (igual = un día); 2.º < desde = nuevo desde;
    con ambos puestos, reinicia con ese día.
  - `enSeleccion` (con y sin hasta), `extremoDeSeleccion` (desde/hasta/ninguno).
  - `moverFoco`: flechas ±1/±7, Inicio/Fin = lunes/domingo, RePág/AvPág = ±1 mes con el día
    ajustado al último del mes (31/3 → 28/2), recorte a [min, max], tecla ajena = null.
  - `limitesAusencia(hoy)` = { min: hoy, max: hoy + 365 }.
  - `semanasDelMes(mes)`: solo semanas con algún día del mes; días ajenos = null.
  - `focoInicial`: desde si está en el mes; si no, hoy; si no, el primer día habilitado del mes.
  - `puedeIrAlMes`: anterior/siguiente según min/max.
  - `resumenSeleccion`: ninguno / solo desde (un día + indicación) / rango con cantidad de días.
  - `errorSeleccion`: rango de más de 365 días → "Una ausencia puede durar hasta un año."
- [x] Verlas fallar; implementar `lib/calendario/seleccion-rango.ts`; verlas pasar. Commit.

### Tarea 3 — `MiniCalendario`

- [x] Prueba de render estático (`renderToStaticMarkup`): `<th scope="col" abbr="Miércoles">Mié</th>`,
  un `.mini-dia` por día del mes con `data-fecha`, días pasados `disabled`, hoy con
  `aria-current="date"` y ", hoy" en el nombre, días ya ausentes con `.marcado` y ", ya marcado como
  ausente", los de la selección con `aria-pressed="true"`, un único `tabindex="0"`, anterior con
  `aria-disabled` en el mes de hoy, ninguna clase `cal-day`.
- [x] Verla fallar; implementar `components/ui/mini-calendario.tsx` (estado: mes visible y día con
  foco; flechas vía `moverFoco`, cambia de mes y enfoca tras pintar; título del mes `aria-live`).
- [x] Verla pasar. Commit.

### Tarea 4 — Tarjeta compacta y orden de la página

- [x] `BotonEnvio` acepta `deshabilitado`.
- [x] `panel-ausencias.tsx`: lista de una línea por ausencia (misma `FilaAusencia`, mismos
  `aria-label` y avisos); botón "Marcar una ausencia" (`aria-expanded`, `aria-controls`) que despliega
  indicación, mini calendario, resumen `aria-live="polite"`, `desde`/`hasta` ocultos, "Guardar
  ausencia" (habilitado con el primer día elegido; un día ⇒ hasta = desde) y "Cancelar" (cierra y
  devuelve el foco al botón). Al guardar bien: se cierra, foco al botón, aviso "Ausencia marcada. …".
  Errores de campo del servidor se muestran en el resumen.
- [x] `page.tsx`: tarjeta del calendario primero, `PanelAusencias` después (Administración sigue sin
  verlo); `hoy` sigue llegando del servidor.
- [x] lint + typecheck + test. Commit.

### Tarea 5 — Estilos

- [x] `.panel-ausencias` con margen arriba y filas compactas; `.mini-calendario` casi a sangre en el
  teléfono (margen negativo chico, 3px entre días, máx. ~30rem en escritorio); `.mini-dia` 56px de
  alto, número `min(var(--t-sm), 4.2vw)`; estados: elegido (hundido + acento + borde, extremos
  rellenos), `.marcado` (discontinuo dorado + valija), hoy (anillo), `:disabled` (plano, atenuado),
  foco 3px por encima de los vecinos; contraste alto con bordes sólidos.
- [x] Revisión visual (fuera del repo): render estático + Playwright a 320/375/1280 px, oscuro,
  contraste alto, letra enorme; y el panel interactivo empaquetado con esbuild (acción simulada).
  Sin desborde horizontal a 320px. Commit.

### Tarea 6 — DESIGN.md

- [x] §4: segunda excepción táctil documentada (mini calendario de ausencias: ~39×56px a 375px) con
  sus mitigaciones. §12: la pieza nueva y el ancla `.mini-calendario .mini-dia[data-fecha]`. Commit.

### Tarea 7 — E2E

- [x] `tests/e2e/soporte/ausencias.ts`: `marcarAusencia(page, desde, hasta?)` abre el panel, navega
  con "Ir al mes siguiente/anterior" hasta el mes de cada fecha, toca los días y guarda.
- [x] `comidas.spec.ts`: la prueba de ausencia usa el helper (conserva "Ausencia marcada.",
  `/^Quitar la ausencia del /`, "Sí, quitar", "Ausencia quitada.").
- [x] `calendario.spec.ts`: limpiar ausencias en `afterEach`; rango que cruza al mes siguiente (resumen,
  guardado, marcado en ambos calendarios, quitar); días pasados deshabilitados y teclado recortado a
  hoy; Administración sin "Mis ausencias" ni mini calendario.
- [x] lint + typecheck. Commit.

### Tarea 8 — PR

- [x] lint, typecheck, test en verde. Push, `gh pr create --base master` (título y cuerpo en español,
  con la excepción táctil y el plan de pruebas). Sin migración.
- [ ] `gh pr checks --watch` hasta verde (relanzar `base-de-datos` si falla por "port already in use").
