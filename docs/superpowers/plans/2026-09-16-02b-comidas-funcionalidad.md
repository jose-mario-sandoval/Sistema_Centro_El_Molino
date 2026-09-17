# Comidas — Parte B: funcionalidad — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** sección Comidas completa sobre el esquema de la Parte A:
- **Plan semanal** (Director, Residente): cuadrícula 7 días × 3 comidas editable, que se guarda al cambiar; en celular, lista por día.
- **Plan semanal** (Administración): tabla comparativa de solo lectura.
- **Semana** (Director, Residente): navegación `?semana=` (pasadas solo lectura, actual y siguiente editables), 6 opciones por comida, "según tu plan" / "cambiada", "cierra hoy 10:00" / "cerrada", nota y "Volver a mi plan".
- **Semana** (Administración): `?semana=` y `?dia=`, resumen por comida con horas agrupadas ("1 tarde (13:30)"), tabla personas × comidas con excepciones resaltadas y "Sin definir"; se refresca al volver la app a primer plano.
- Datos demo y pruebas unitarias y de punta a punta.

**Arquitectura:**
- **Lógica pura** (Vitest, sin `server-only`): `lib/comidas/notas.ts` (espejo de `nota_valida`), `resumen.ts` (conteos), `semana.ts` (fechas de la semana, navegación, textos de cierre y de error), `vista.ts` (combina filas de la base en lo que muestra cada pantalla, con `valorEfectivo` y `estaAbierta` de la Fase 0).
- **Servidor:** `lib/comidas/consultas.ts` lee con la sesión del usuario (RLS aplica) y delega el armado en `vista.ts`. `app/(app)/comidas/acciones.ts` escribe el plan con `upsert`/`delete` y la selección con las RPC `guardar_seleccion` y `volver_a_plan`, traduciendo `MOL01`, `MOL04` y `42501` a mensajes en español.
- **Pantallas:** páginas Server Component que calculan fechas con `lib/fechas` y pasan `FechaISO` y etiquetas ya formateadas a componentes cliente pequeños (`useOptimistic`, `useTransition`, `useAviso`).

**Stack:** Next.js 16.3 (App Router), React 19.3, TypeScript 5.9, `@supabase/supabase-js` 2.116, zod 4, Vitest 5, Playwright 1.63.

**Referencias:** spec §5.1, §6 (todo), §9 · índice [`2026-09-16-00-indice.md`](2026-09-16-00-indice.md) §2, §3 (en especial §3.3 Server Actions y §3.4 firmas SQL de Comidas), §4 (`SEMBRADORES`) · Fase 0 [`2026-09-16-01-fase-0-base.md`](2026-09-16-01-fase-0-base.md) (tareas 3, 4, 9, 10, 13, 14, 15, 16) · Parte A [`2026-09-16-02a-comidas-esquema.md`](2026-09-16-02a-comidas-esquema.md) · prototipo `docs/prototipo/centro-el-molino.html` (`renderComidas`, `buildStatusSelect`, `renderPlanSemanal`, `renderPlanSemanalAdmin`, `renderSemana`, `renderSemanaAdmin`).

**Antes de empezar:**
- La Parte A (02-A) está **mergeada y aplicada** al proyecto (la Action de despliegue terminó en verde). La Tarea 1 lo verifica.
- En esta computadora ya se hizo `npx supabase login` y `npx supabase link --project-ref <ref>` (lo necesita `npm run db:tipos`).
- `.env.local` completo (para `npm run dev` y `datos-demo`).

**Contrato SQL que se usa (de 02-A, no se modifica):**
- Tablas `plan_semanal(usuario_id, dia_semana 1..7, comida, estado, nota)`, `selecciones_comida(usuario_id, fecha, comida, estado, nota, origen, actualizado_en)`, `comidas_cerradas(fecha, comida, cerrada_en)`.
- `guardar_seleccion({ p_fecha, p_comida, p_estado, p_nota })` → `void`. Errores: `MOL01` (cerrada o fuera de ventana), `MOL04` (nota inválida), `42501` (rol). Si estado y nota son iguales al plan, borra la excepción.
- `volver_a_plan({ p_fecha, p_comida })` → `void`. Errores: `MOL01`, `42501`.
- CHECK `nota_valida` en ambas tablas (error `23514`): `temprano`/`tarde` con nota `HH:MM`; `enfermo` con texto de 1 a 200 caracteres; el resto con nota `null`.
- RLS: cada persona lee lo suyo; Administración lee todo; Director y Residente escriben solo su propio plan.

---

## Decisiones de esta pista

- **Plan semanal: se guarda al cambiar el selector.** Si el estado elegido lleva nota (temprano, tarde, enfermo), se guarda recién cuando la nota es válida, al salir del campo. Mientras tanto la celda muestra la ayuda de la nota. Elegir "Sin definir" borra la fila del plan.
- **Semana: los chips sin nota guardan al tocarlos.** Los que llevan nota abren un editor con "Guardar" y "Cancelar". Tocar el chip ya elegido (sin nota) no hace nada: una selección no puede quedar vacía; para quitar un cambio está "Volver a mi plan".
- **Actualización optimista por comida:** cada comida tiene su propio `useOptimistic` y `useTransition`. Si la acción falla, se muestra el aviso y el valor vuelve solo al del servidor (fin de la transición). Si sale bien, `router.refresh()`.
- **Guardar lo mismo que el plan** se muestra en forma optimista como "según tu plan" (`valorTrasGuardar`), igual que hace `guardar_seleccion` al borrar la excepción.
- **Etiquetas de fecha sin `Intl`:** `semana.ts` usa arreglos propios ("Miércoles 23/9", "cierra mié 23/9 10:00"). Dan el mismo texto en Node, en el navegador y en las pruebas. Igual se calculan en el servidor y el cliente solo recibe texto.
- **`?semana=`:** cualquier fecha válida se lleva a su lunes. Si es posterior a la semana siguiente o no es válida, se usa la semana actual. Las semanas pasadas no tienen límite hacia atrás.
- **`?dia=` (Administración):** si no pertenece a la semana mostrada, se usa hoy (si hoy está en esa semana) o el lunes.
- **Texto del error `MOL01`:** la acción vuelve a leer las horas límite y arma el mensaje con `mensajeComidaCerrada`: "El almuerzo ya cerró a las 10:00.", "El desayuno ya cerró a las 21:00 del día anterior." o "Solo podés cambiar la semana actual y la siguiente.". Si no se reconoce el código, el error se registra con `console.error` y se muestra un mensaje general.
- **`obtenerHorasLimite` vive en `lib/comidas/consultas.ts`.** Las pistas 05 y 06 tienen su propia conversión de filas; no se comparte para no depender del orden de merge.
- **Plan en celular (spec §6.5):** el HTML de la cuadrícula va ordenado por día y cada celda se ubica con `gridColumn`/`gridRow`. Por debajo de 640 px la cuadrícula pasa a `flex` en columna: queda una lista por día y cada celda muestra el nombre de la comida.
- **Excepciones en la tabla de Administración:** celda con clase `excepcion` (fondo `--accent-soft` y borde izquierdo) más el texto "cambiada por la persona". "Sin definir" se muestra en color de peligro.
- **Sin código de error nuevo:** se usan `MOL01` y `MOL04` de 02-A.

---

## Mapa de archivos

```
lib/supabase/database.types.ts                          regenerado (plan_semanal, selecciones_comida, comidas_cerradas, RPC)
lib/comidas/notas.ts                                     normalizarNota, notaValida, mensajeNota (espejo de nota_valida)
lib/comidas/resumen.ts                                   resumenComida, textoResumen
lib/comidas/semana.ts                                    fechas de la semana, navegación, etiquetas, textoCierre, mensajeComidaCerrada
lib/comidas/vista.ts                                     tipos de vista, planDesdeFilas, armarSemanaPersona, armarDiaAdministracion, valorTrasGuardar
lib/comidas/consultas.ts                                 server-only: horas límite, plan propio, semana propia, planes de todos, día para Administración
lib/validacion/comidas.ts                                esquemaPlan, esquemaSeleccion, esquemaVolverAPlan
app/(app)/comidas/acciones.ts                            guardarPlan, guardarSeleccion, volverAPlan
app/(app)/comidas/layout.tsx                             encabezado y pestañas
app/(app)/comidas/error.tsx                              error de la sección con "Reintentar"
app/(app)/comidas/_componentes/pestanas.tsx              pestañas Link (cliente)
app/(app)/comidas/_componentes/insignia-estado.tsx       estiloEstado e InsigniaEstado (sin 'use client')
app/(app)/comidas/_componentes/plan-editable.tsx         cuadrícula editable (cliente)
app/(app)/comidas/_componentes/plan-administracion.tsx   tabla comparativa (servidor)
app/(app)/comidas/_componentes/navegacion-semana.tsx     ‹ rango › (servidor)
app/(app)/comidas/_componentes/comida-del-dia.tsx        chips, nota y "Volver a mi plan" (cliente)
app/(app)/comidas/_componentes/semana-persona.tsx        lista de días (servidor)
app/(app)/comidas/_componentes/semana-administracion.tsx selector de día, resumen y tabla (servidor)
app/(app)/comidas/_componentes/refrescar-al-volver.tsx   visibilitychange → router.refresh() (cliente)
app/(app)/comidas/plan/page.tsx                          reemplaza la provisional
app/(app)/comidas/semana/page.tsx                        reemplaza la provisional
app/globals.css                                          (modificar) estilos agregados de comidas
scripts/demo/comidas.ts                                  sembrador demo
scripts/datos-demo.ts                                    (modificar) entrada en SEMBRADORES
tests/unit/comidas/notas.test.ts
tests/unit/comidas/resumen.test.ts
tests/unit/comidas/semana.test.ts
tests/unit/comidas/vista.test.ts
tests/unit/comidas/validacion.test.ts
tests/e2e/comidas.spec.ts
```

---

### Tarea 1: Rama, verificación de 02-A y tipos regenerados

**Archivos:**
- Modificar: `lib/supabase/database.types.ts` (generado; nunca a mano)

- [ ] **Paso 1: Actualizar `master` y confirmar que la migración de 02-A está en el repo**

```bash
git switch master && git pull
ls supabase/migrations/*_comidas*.sql
```

Esperado: al menos un archivo (por ejemplo `20260920120000_comidas_esquema.sql`). Si no aparece, la Parte A no está mergeada: **detenerse**.

- [ ] **Paso 2: Confirmar que el despliegue de la migración terminó bien**

```bash
gh run list --workflow desplegar.yml --branch master --limit 1
```

Esperado: `completed` / `success` en el commit del merge de 02-A o en uno posterior.

- [ ] **Paso 3: Crear la rama**

```bash
git switch -c feat/comidas-funcionalidad
```

- [ ] **Paso 4: Regenerar tipos desde el proyecto**

```bash
npm run db:tipos
grep -c "guardar_seleccion: {\|volver_a_plan: {\|plan_semanal: {\|selecciones_comida: {\|comidas_cerradas: {" lib/supabase/database.types.ts
grep -n "guardar_seleccion: {" -A10 lib/supabase/database.types.ts
```

Esperado: el conteo es `5` o más, y los `Args` de `guardar_seleccion` incluyen `p_fecha`, `p_comida`, `p_estado` y `p_nota`. Si falta algo, la migración no está aplicada: volver al Paso 2.

- [ ] **Paso 5: Revisar los supuestos que usa este plan contra la migración**

```bash
grep -n "primary key\|unique" supabase/migrations/*_comidas*.sql
grep -n "function public.nota_valida" -A20 supabase/migrations/*_comidas*.sql
```

Esperado:
- `plan_semanal` con clave `(usuario_id, dia_semana, comida)` y `selecciones_comida` con clave `(usuario_id, fecha, comida)`. Las usan los `onConflict` de las tareas 8 y 13.
- `nota_valida`: hora con patrón `^([01][0-9]|2[0-3]):[0-5][0-9]$` y texto de 1 a 200 caracteres.

Si la migración difiere, **manda el SQL**: ajustar `lib/comidas/notas.ts` (Tarea 2) y los `onConflict` antes de seguir.

- [ ] **Paso 6: Verificar tipos**

```bash
npm run typecheck
```

Esperado: sin errores.

- [ ] **Paso 7: Commit**

```bash
git add lib/supabase/database.types.ts
git commit -m "chore(db): tipos con plan_semanal, selecciones_comida y RPC de comidas"
```

---
### Tarea 2: Notas de comida (espejo de `nota_valida`)

**Archivos:**
- Crear: `lib/comidas/notas.ts`
- Prueba: `tests/unit/comidas/notas.test.ts`

**Reglas (iguales al CHECK `nota_valida` de 02-A):**
- `INFO_ESTADO[estado].nota === 'hora'` (temprano, tarde): nota obligatoria `HH:MM` de 00:00 a 23:59.
- `'texto'` (enfermo): nota obligatoria de 1 a 200 caracteres.
- `null` (si, no, bolsa): nota `null`.
- `normalizarNota` prepara lo que escribe la persona: recorta espacios, convierte `''` en `null`, recorta segundos (`13:30:00` → `13:30`, lo que puede enviar un `<input type="time">`) y descarta la nota de los estados que no la llevan.

- [ ] **Paso 1: Escribir la prueba que falla**

`tests/unit/comidas/notas.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { mensajeNota, normalizarNota, notaValida } from '@/lib/comidas/notas'

describe('normalizarNota', () => {
  it('recorta espacios y segundos en las notas de hora', () => {
    expect(normalizarNota('tarde', ' 13:30 ')).toBe('13:30')
    expect(normalizarNota('temprano', '06:45:00')).toBe('06:45')
  })

  it('recorta el texto de enfermo', () => {
    expect(normalizarNota('enfermo', '  Solo sopa  ')).toBe('Solo sopa')
  })

  it('vacío, solo espacios, null o undefined quedan como null', () => {
    expect(normalizarNota('tarde', '')).toBeNull()
    expect(normalizarNota('enfermo', '   ')).toBeNull()
    expect(normalizarNota('tarde', null)).toBeNull()
    expect(normalizarNota('enfermo', undefined)).toBeNull()
  })

  it('descarta la nota de los estados que no la llevan', () => {
    expect(normalizarNota('si', '13:30')).toBeNull()
    expect(normalizarNota('no', 'algo')).toBeNull()
    expect(normalizarNota('bolsa', 'algo')).toBeNull()
  })

  it('deja sin tocar una hora con otro formato (la valida notaValida)', () => {
    expect(normalizarNota('tarde', '7:30')).toBe('7:30')
  })
})

describe('notaValida', () => {
  it.each([
    ['si', null],
    ['no', null],
    ['bolsa', null],
    ['temprano', '06:05'],
    ['tarde', '13:30'],
    ['tarde', '00:00'],
    ['tarde', '23:59'],
    ['enfermo', 'Sopa'],
    ['enfermo', 'x'.repeat(200)],
  ] as const)('acepta %s con nota %j', (estado, nota) => {
    expect(notaValida(estado, nota)).toBe(true)
  })

  it.each([
    ['si', 'algo'],
    ['bolsa', ''],
    ['tarde', null],
    ['tarde', '24:00'],
    ['tarde', '7:30'],
    ['temprano', '12:60'],
    ['temprano', '13:30:00'],
    ['enfermo', null],
    ['enfermo', ''],
    ['enfermo', 'x'.repeat(201)],
  ] as const)('rechaza %s con nota %j', (estado, nota) => {
    expect(notaValida(estado, nota)).toBe(false)
  })
})

describe('mensajeNota', () => {
  it('explica qué falta según el tipo de nota', () => {
    expect(mensajeNota('tarde')).toBe('Indicá la hora para "Comer tarde" (HH:MM).')
    expect(mensajeNota('temprano')).toBe('Indicá la hora para "Comer temprano" (HH:MM).')
    expect(mensajeNota('enfermo')).toBe('Indicá qué podés comer (hasta 200 caracteres).')
    expect(mensajeNota('si')).toBe('"Sí comer" no lleva nota.')
  })
})
```

- [ ] **Paso 2: Correr y verificar que falla**

Run: `npm test -- tests/unit/comidas/notas`
Esperado: FAIL con `Failed to resolve import "@/lib/comidas/notas"`.

- [ ] **Paso 3: Implementar `lib/comidas/notas.ts`**

```ts
import { INFO_ESTADO, type EstadoComida } from './tipos'

/** Igual que el CHECK nota_valida de 02-A. */
const PATRON_HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const HORA_CON_SEGUNDOS = /^\d{2}:\d{2}:\d{2}$/
export const LARGO_MAXIMO_NOTA = 200

/** Deja la nota como la guarda la base: recortada, sin segundos y null si no corresponde. */
export function normalizarNota(estado: EstadoComida, nota: string | null | undefined): string | null {
  const tipo = INFO_ESTADO[estado].nota
  if (tipo === null) return null
  const recortada = (nota ?? '').trim()
  if (recortada === '') return null
  if (tipo === 'hora' && HORA_CON_SEGUNDOS.test(recortada)) return recortada.slice(0, 5)
  return recortada
}

/** Espejo de public.nota_valida(estado, nota). */
export function notaValida(estado: EstadoComida, nota: string | null): boolean {
  const tipo = INFO_ESTADO[estado].nota
  if (tipo === null) return nota === null
  if (nota === null) return false
  if (tipo === 'hora') return PATRON_HORA.test(nota)
  return nota.length >= 1 && nota.length <= LARGO_MAXIMO_NOTA
}

/** Texto para el aviso o el campo cuando la nota no es válida. */
export function mensajeNota(estado: EstadoComida): string {
  const { etiqueta, nota } = INFO_ESTADO[estado]
  if (nota === 'hora') return `Indicá la hora para "${etiqueta}" (HH:MM).`
  if (nota === 'texto') return `Indicá qué podés comer (hasta ${LARGO_MAXIMO_NOTA} caracteres).`
  return `"${etiqueta}" no lleva nota.`
}
```

- [ ] **Paso 4: Correr y verificar que pasa**

Run: `npm test -- tests/unit/comidas/notas`
Esperado: PASS (25 pruebas).

- [ ] **Paso 5: Commit**

```bash
git add lib/comidas/notas.ts tests/unit/comidas/notas.test.ts
git commit -m "feat(comidas): normalización y validación de notas igual que nota_valida"
```

---
### Tarea 3: Resumen por comida

**Archivos:**
- Crear: `lib/comidas/resumen.ts`
- Prueba: `tests/unit/comidas/resumen.test.ts`

**Formato (spec §6.5):**
- Una parte por estado presente, en el orden de `ESTADOS_COMIDA`, y "sin definir" al final.
- En temprano y tarde, las horas van entre paréntesis y ordenadas; si una hora se repite, se indica con `×n`: `3 tarde (13:30 ×2, 14:00)`.
- La nota de enfermo no entra en el resumen; se ve en la tabla.
- El origen (plan o persona) no cambia el conteo.

- [ ] **Paso 1: Escribir la prueba que falla**

`tests/unit/comidas/resumen.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { resumenComida, textoResumen } from '@/lib/comidas/resumen'
import type { EstadoComida, ValorEfectivo } from '@/lib/comidas/tipos'

function v(estado: EstadoComida, nota: string | null = null, origen: 'plan' | 'persona' = 'plan'): ValorEfectivo {
  return { estado, nota, origen }
}

describe('resumenComida', () => {
  it('sin personas no tiene partes', () => {
    const resumen = resumenComida([])
    expect(resumen).toEqual({ total: 0, partes: [] })
    expect(textoResumen(resumen)).toBe('Sin personas')
  })

  it('cuenta por estado en orden fijo y deja "sin definir" al final', () => {
    const resumen = resumenComida([v('no'), null, v('si'), v('tarde', '13:30'), v('si')])
    expect(resumen).toEqual({
      total: 5,
      partes: [
        { clave: 'si', cantidad: 2, texto: '2 sí' },
        { clave: 'no', cantidad: 1, texto: '1 no' },
        { clave: 'tarde', cantidad: 1, texto: '1 tarde (13:30)' },
        { clave: 'sin_definir', cantidad: 1, texto: '1 sin definir' },
      ],
    })
  })

  it('agrupa y ordena las horas de temprano y tarde', () => {
    const resumen = resumenComida([v('tarde', '14:00'), v('tarde', '13:30'), v('temprano', '06:30'), v('tarde', '13:30')])
    expect(resumen.partes.map((p) => p.texto)).toEqual(['1 temprano (06:30)', '3 tarde (13:30 ×2, 14:00)'])
  })

  it('cuenta igual lo que viene del plan y lo que cambió la persona', () => {
    const resumen = resumenComida([v('si', null, 'plan'), v('si', null, 'persona')])
    expect(resumen.partes).toEqual([{ clave: 'si', cantidad: 2, texto: '2 sí' }])
  })

  it('no muestra la nota de enfermo y nombra "en bolsa"', () => {
    const resumen = resumenComida([v('enfermo', 'Solo sopa'), v('bolsa')])
    expect(resumen.partes.map((p) => p.texto)).toEqual(['1 en bolsa', '1 enfermo'])
  })

  it('una hora sin nota no agrega paréntesis', () => {
    expect(resumenComida([v('tarde')]).partes[0].texto).toBe('1 tarde')
  })
})

describe('textoResumen', () => {
  it('une las partes con un punto medio', () => {
    expect(textoResumen(resumenComida([v('si'), v('tarde', '13:30'), null]))).toBe('1 sí · 1 tarde (13:30) · 1 sin definir')
  })
})
```

- [ ] **Paso 2: Correr y verificar que falla**

Run: `npm test -- tests/unit/comidas/resumen`
Esperado: FAIL con `Failed to resolve import "@/lib/comidas/resumen"`.

- [ ] **Paso 3: Implementar `lib/comidas/resumen.ts`**

```ts
import { ESTADOS_COMIDA, INFO_ESTADO, type EstadoComida, type SeleccionGuardada, type ValorEfectivo } from './tipos'

export type ClaveResumen = EstadoComida | 'sin_definir'
export type ParteResumen = { clave: ClaveResumen; cantidad: number; texto: string }
export type ResumenComida = { total: number; partes: ParteResumen[] }

const ETIQUETA_CORTA: Record<EstadoComida, string> = {
  si: 'sí',
  no: 'no',
  temprano: 'temprano',
  tarde: 'tarde',
  bolsa: 'en bolsa',
  enfermo: 'enfermo',
}

/** ['13:30', '14:00', '13:30'] → ['13:30 ×2', '14:00'] */
function horasAgrupadas(notas: (string | null)[]): string[] {
  const conteo = new Map<string, number>()
  for (const nota of notas) {
    if (nota) conteo.set(nota, (conteo.get(nota) ?? 0) + 1)
  }
  return [...conteo.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([hora, cantidad]) => (cantidad > 1 ? `${hora} ×${cantidad}` : hora))
}

/** Conteo de una comida para el resumen de Administración (spec §6.5). null = "Sin definir". */
export function resumenComida(valores: ValorEfectivo[]): ResumenComida {
  const partes: ParteResumen[] = []

  for (const estado of ESTADOS_COMIDA) {
    const delEstado = valores.filter((valor): valor is SeleccionGuardada => valor !== null && valor.estado === estado)
    if (delEstado.length === 0) continue
    let texto = `${delEstado.length} ${ETIQUETA_CORTA[estado]}`
    if (INFO_ESTADO[estado].nota === 'hora') {
      const horas = horasAgrupadas(delEstado.map((valor) => valor.nota))
      if (horas.length > 0) texto += ` (${horas.join(', ')})`
    }
    partes.push({ clave: estado, cantidad: delEstado.length, texto })
  }

  const sinDefinir = valores.filter((valor) => valor === null).length
  if (sinDefinir > 0) partes.push({ clave: 'sin_definir', cantidad: sinDefinir, texto: `${sinDefinir} sin definir` })

  return { total: valores.length, partes }
}

export function textoResumen(resumen: ResumenComida): string {
  if (resumen.partes.length === 0) return 'Sin personas'
  return resumen.partes.map((parte) => parte.texto).join(' · ')
}
```

- [ ] **Paso 4: Correr y verificar que pasa**

Run: `npm test -- tests/unit/comidas/resumen`
Esperado: PASS (7 pruebas).

- [ ] **Paso 5: Commit**

```bash
git add lib/comidas/resumen.ts tests/unit/comidas/resumen.test.ts
git commit -m "feat(comidas): resumen por comida con horas agrupadas"
```

---
### Tarea 4: Semana: fechas, navegación y textos de cierre

**Archivos:**
- Crear: `lib/comidas/semana.ts`
- Prueba: `tests/unit/comidas/semana.test.ts`

**Datos de referencia (verificados):**
- Semana actual de referencia: hoy miércoles 2026-09-16; lunes 2026-09-14; semana siguiente 2026-09-21 … 2026-09-27.
- Horas límite por defecto: desayuno día anterior 21:00, almuerzo mismo día 10:00, cena mismo día 16:00.
- 2026-09-28 es lunes y su domingo es 2026-10-04.
- `2026-09-16T23:30:00-06:00` ya es día 17 en UTC: los textos deben usar la fecha local.

- [ ] **Paso 1: Escribir la prueba que falla**

`tests/unit/comidas/semana.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  diaPedido,
  diasDeSemana,
  esFechaISO,
  etiquetaDia,
  fechaCorta,
  mensajeComidaCerrada,
  navegacionSemana,
  rangoSemana,
  semanaPedida,
  textoCierre,
  tipoSemana,
} from '@/lib/comidas/semana'
import { HORAS_LIMITE_POR_DEFECTO, type TiempoComida } from '@/lib/comidas/tipos'

const HOY = '2026-09-16'
const horas = HORAS_LIMITE_POR_DEFECTO

describe('esFechaISO', () => {
  it('acepta fechas reales YYYY-MM-DD', () => {
    expect(esFechaISO('2026-09-16')).toBe(true)
    expect(esFechaISO('2028-02-29')).toBe(true)
  })

  it.each([['2026-02-30'], ['16/09/2026'], ['2026-9-16'], ['1999-12-31'], [undefined], [['2026-09-16']]])(
    'rechaza %j',
    (valor) => {
      expect(esFechaISO(valor)).toBe(false)
    },
  )
})

describe('etiquetas', () => {
  it('nombre del día y fecha corta sin ceros', () => {
    expect(etiquetaDia('2026-09-23')).toBe('Miércoles 23/9')
    expect(etiquetaDia('2026-10-04')).toBe('Domingo 4/10')
    expect(fechaCorta('2026-01-05')).toBe('5/1')
  })

  it('rango de la semana que cruza de mes', () => {
    expect(rangoSemana('2026-09-28')).toBe('28/9 — 4/10')
  })

  it('diasDeSemana devuelve los 7 días desde el lunes', () => {
    expect(diasDeSemana('2026-09-28')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ])
  })
})

describe('semanaPedida', () => {
  it.each([
    ['sin parámetro', undefined, '2026-09-14'],
    ['lunes de la semana siguiente', '2026-09-21', '2026-09-21'],
    ['jueves de la semana siguiente', '2026-09-24', '2026-09-21'],
    ['semana pasada', '2026-09-07', '2026-09-07'],
    ['dentro de dos semanas', '2026-09-28', '2026-09-14'],
    ['texto inválido', 'basura', '2026-09-14'],
    ['fecha inexistente', '2026-02-30', '2026-09-14'],
    ['parámetro repetido', ['2026-09-21', '2026-09-28'], '2026-09-14'],
  ])('%s', (_caso, valor, esperado) => {
    expect(semanaPedida(valor, HOY)).toBe(esperado)
  })

  it('el domingo, la semana siguiente sigue siendo la del lunes de mañana', () => {
    expect(semanaPedida('2026-09-21', '2026-09-20')).toBe('2026-09-21')
    expect(semanaPedida('2026-09-28', '2026-09-20')).toBe('2026-09-14')
  })
})

describe('tipoSemana y navegacionSemana', () => {
  it('clasifica la semana respecto de hoy', () => {
    expect(tipoSemana('2026-09-07', HOY)).toBe('pasada')
    expect(tipoSemana('2026-09-14', HOY)).toBe('actual')
    expect(tipoSemana('2026-09-21', HOY)).toBe('siguiente')
  })

  it('no permite avanzar más allá de la semana siguiente', () => {
    expect(navegacionSemana('2026-08-31', HOY)).toEqual({ anterior: '2026-08-24', siguiente: '2026-09-07', tipo: 'pasada' })
    expect(navegacionSemana('2026-09-14', HOY)).toEqual({ anterior: '2026-09-07', siguiente: '2026-09-21', tipo: 'actual' })
    expect(navegacionSemana('2026-09-21', HOY)).toEqual({ anterior: '2026-09-14', siguiente: null, tipo: 'siguiente' })
  })
})

describe('diaPedido', () => {
  it.each([
    ['día válido de la semana', '2026-09-23', '2026-09-21', '2026-09-23'],
    ['sin día en la semana siguiente → lunes', undefined, '2026-09-21', '2026-09-21'],
    ['sin día en la semana actual → hoy', undefined, '2026-09-14', '2026-09-16'],
    ['día de otra semana → lunes', '2026-09-30', '2026-09-21', '2026-09-21'],
    ['día inválido en la semana actual → hoy', 'basura', '2026-09-14', '2026-09-16'],
  ])('%s', (_caso, valor, lunes, esperado) => {
    expect(diaPedido(valor, lunes, HOY)).toBe(esperado)
  })
})

describe('textoCierre', () => {
  const ahora = new Date('2026-09-16T08:00:00-06:00')

  it.each([
    ['2026-09-16', 'almuerzo', 'cierra hoy 10:00'],
    ['2026-09-17', 'desayuno', 'cierra hoy 21:00'],
    ['2026-09-17', 'almuerzo', 'cierra mañana 10:00'],
    ['2026-09-18', 'desayuno', 'cierra mañana 21:00'],
    ['2026-09-23', 'almuerzo', 'cierra mié 23/9 10:00'],
    ['2026-09-21', 'desayuno', 'cierra dom 20/9 21:00'],
    ['2026-09-15', 'cena', 'cerrada'],
  ])('%s %s → %s', (fecha, comida, esperado) => {
    expect(textoCierre({ fecha, comida: comida as TiempoComida, ahora, horas, cerrada: false })).toBe(esperado)
  })

  it('una comida marcada como cerrada dice "cerrada" aunque falte para la hora', () => {
    expect(textoCierre({ fecha: '2026-09-16', comida: 'cena', ahora, horas, cerrada: true })).toBe('cerrada')
  })

  it('justo a la hora límite ya está cerrada', () => {
    const alCierre = new Date('2026-09-16T10:00:00-06:00')
    expect(textoCierre({ fecha: '2026-09-16', comida: 'almuerzo', ahora: alCierre, horas, cerrada: false })).toBe('cerrada')
  })

  it('usa la fecha local y no la UTC para "hoy" y "mañana"', () => {
    const noche = new Date('2026-09-16T23:30:00-06:00')
    expect(textoCierre({ fecha: '2026-09-17', comida: 'almuerzo', ahora: noche, horas, cerrada: false })).toBe('cierra mañana 10:00')
  })
})

describe('mensajeComidaCerrada', () => {
  it.each([
    ['2026-09-16T10:30:00-06:00', '2026-09-16', 'almuerzo', 'El almuerzo ya cerró a las 10:00.'],
    ['2026-09-16T21:30:00-06:00', '2026-09-17', 'desayuno', 'El desayuno ya cerró a las 21:00 del día anterior.'],
    ['2026-09-16T16:30:00-06:00', '2026-09-16', 'cena', 'La cena ya cerró a las 16:00.'],
    ['2026-09-16T08:00:00-06:00', '2026-09-16', 'cena', 'La cena ya cerró.'],
    ['2026-09-16T08:00:00-06:00', '2026-09-13', 'cena', 'Solo podés cambiar la semana actual y la siguiente.'],
    ['2026-09-16T08:00:00-06:00', '2026-09-28', 'almuerzo', 'Solo podés cambiar la semana actual y la siguiente.'],
  ])('%s, %s %s', (ahora, fecha, comida, esperado) => {
    expect(mensajeComidaCerrada({ fecha, comida: comida as TiempoComida, ahora: new Date(ahora), horas })).toBe(esperado)
  })
})
```

- [ ] **Paso 2: Correr y verificar que falla**

Run: `npm test -- tests/unit/comidas/semana`
Esperado: FAIL con `Failed to resolve import "@/lib/comidas/semana"`.

- [ ] **Paso 3: Implementar `lib/comidas/semana.ts`**

Sin `Intl`: los nombres de días salen de arreglos propios, así el texto es idéntico en Node, en el navegador y en las pruebas.

```ts
import { diaSemana, fechaISOEn, horaHHMM, lunesDe, sumarDias, type FechaISO } from '@/lib/fechas'
import { cierreDe, enVentanaEditable, estaAbierta } from './reglas'
import { ETIQUETA_TIEMPO, type HorasLimite, type TiempoComida } from './tipos'

export const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const
const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'] as const
const ARTICULO: Record<TiempoComida, string> = { desayuno: 'El', almuerzo: 'El', cena: 'La' }

export type TipoSemana = 'pasada' | 'actual' | 'siguiente'

const PATRON_FECHA = /^20\d{2}-\d{2}-\d{2}$/

/** 'YYYY-MM-DD' de un día que existe (años 2000–2099). */
export function esFechaISO(valor: unknown): valor is FechaISO {
  return typeof valor === 'string' && PATRON_FECHA.test(valor) && sumarDias(valor, 0) === valor
}

/** 'Miércoles' */
export function nombreDia(fecha: FechaISO): string {
  return NOMBRES_DIA[diaSemana(fecha) - 1]
}

/** '23/9' */
export function fechaCorta(fecha: FechaISO): string {
  const [, mes, dia] = fecha.split('-')
  return `${Number(dia)}/${Number(mes)}`
}

/** 'Miércoles 23/9' */
export function etiquetaDia(fecha: FechaISO): string {
  return `${nombreDia(fecha)} ${fechaCorta(fecha)}`
}

/** '14/9 — 20/9' */
export function rangoSemana(lunes: FechaISO): string {
  return `${fechaCorta(lunes)} — ${fechaCorta(sumarDias(lunes, 6))}`
}

export function diasDeSemana(lunes: FechaISO): FechaISO[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

/** Lunes de la semana pedida en `?semana=`. Inválida o posterior a la siguiente → semana actual. */
export function semanaPedida(valor: unknown, hoy: FechaISO): FechaISO {
  const lunesActual = lunesDe(hoy)
  if (!esFechaISO(valor)) return lunesActual
  const lunes = lunesDe(valor)
  return lunes > sumarDias(lunesActual, 7) ? lunesActual : lunes
}

export function tipoSemana(lunes: FechaISO, hoy: FechaISO): TipoSemana {
  const lunesActual = lunesDe(hoy)
  if (lunes < lunesActual) return 'pasada'
  return lunes === lunesActual ? 'actual' : 'siguiente'
}

export function navegacionSemana(
  lunes: FechaISO,
  hoy: FechaISO,
): { anterior: FechaISO; siguiente: FechaISO | null; tipo: TipoSemana } {
  const tipo = tipoSemana(lunes, hoy)
  return { anterior: sumarDias(lunes, -7), siguiente: tipo === 'siguiente' ? null : sumarDias(lunes, 7), tipo }
}

/** Día pedido en `?dia=` si pertenece a la semana; si no, hoy (si está en la semana) o el lunes. */
export function diaPedido(valor: unknown, lunes: FechaISO, hoy: FechaISO): FechaISO {
  const dias = diasDeSemana(lunes)
  if (esFechaISO(valor) && dias.includes(valor)) return valor
  return dias.includes(hoy) ? hoy : lunes
}

/** 'cierra hoy 10:00' · 'cierra mañana 21:00' · 'cierra mié 23/9 10:00' · 'cerrada' (spec §6.5). */
export function textoCierre(p: {
  fecha: FechaISO
  comida: TiempoComida
  ahora: Date
  horas: HorasLimite
  cerrada: boolean
}): string {
  if (!estaAbierta(p)) return 'cerrada'
  const diaCierre = fechaISOEn(cierreDe(p.fecha, p.comida, p.horas))
  const hora = horaHHMM(p.horas[p.comida].hora)
  const hoy = fechaISOEn(p.ahora)
  if (diaCierre === hoy) return `cierra hoy ${hora}`
  if (diaCierre === sumarDias(hoy, 1)) return `cierra mañana ${hora}`
  return `cierra ${DIAS_CORTOS[diaSemana(diaCierre) - 1]} ${fechaCorta(diaCierre)} ${hora}`
}

/** Texto del error MOL01 (spec §6.4): fuera de ventana, pasó la hora o ya la cerró la tarea. */
export function mensajeComidaCerrada(p: { fecha: FechaISO; comida: TiempoComida; ahora: Date; horas: HorasLimite }): string {
  if (!enVentanaEditable(p.fecha, p.ahora)) return 'Solo podés cambiar la semana actual y la siguiente.'
  const nombre = `${ARTICULO[p.comida]} ${ETIQUETA_TIEMPO[p.comida].toLowerCase()}`
  if (p.ahora.getTime() < cierreDe(p.fecha, p.comida, p.horas).getTime()) return `${nombre} ya cerró.`
  const { diaRelativo, hora } = p.horas[p.comida]
  return diaRelativo === -1
    ? `${nombre} ya cerró a las ${horaHHMM(hora)} del día anterior.`
    : `${nombre} ya cerró a las ${horaHHMM(hora)}.`
}
```

- [ ] **Paso 4: Correr y verificar que pasa**

Run: `npm test -- tests/unit/comidas/semana`
Esperado: PASS (42 pruebas).

- [ ] **Paso 5: Commit**

```bash
git add lib/comidas/semana.ts tests/unit/comidas/semana.test.ts
git commit -m "feat(comidas): semana, navegación y textos de cierre en hora local"
```

---
### Tarea 5: Armado de las vistas (lógica pura)

**Archivos:**
- Crear: `lib/comidas/vista.ts`
- Prueba: `tests/unit/comidas/vista.test.ts`

Convierte las filas que devuelve la base en lo que muestra cada pantalla. Así `consultas.ts` solo lee y todo el cálculo (valor efectivo, abierta, textos, resumen) se prueba sin base. Los tipos de este archivo los importan también los componentes cliente.

- [ ] **Paso 1: Escribir la prueba que falla**

`tests/unit/comidas/vista.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { textoResumen } from '@/lib/comidas/resumen'
import { HORAS_LIMITE_POR_DEFECTO } from '@/lib/comidas/tipos'
import {
  armarDiaAdministracion,
  armarSemanaPersona,
  planDesdeFilas,
  valorTrasGuardar,
  type FilaPlan,
} from '@/lib/comidas/vista'

const AHORA = new Date('2026-09-16T08:00:00-06:00')
const horas = HORAS_LIMITE_POR_DEFECTO

const FILAS_PLAN: FilaPlan[] = [
  { dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null },
  { dia_semana: 3, comida: 'cena', estado: 'temprano', nota: '19:00' },
  { dia_semana: 1, comida: 'cena', estado: 'no', nota: null },
]

describe('planDesdeFilas', () => {
  it('agrupa por día de la semana y comida', () => {
    expect(planDesdeFilas(FILAS_PLAN)).toEqual({
      1: { cena: { estado: 'no', nota: null } },
      3: { almuerzo: { estado: 'si', nota: null }, cena: { estado: 'temprano', nota: '19:00' } },
    })
  })
})

describe('armarSemanaPersona', () => {
  const base = { lunes: '2026-09-14', ahora: AHORA, horas, plan: planDesdeFilas(FILAS_PLAN), selecciones: [], cerradas: [] }

  it('devuelve los 7 días con etiquetas y marca solo hoy', () => {
    const dias = armarSemanaPersona(base)
    expect(dias.map((d) => d.fecha)).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
    ])
    expect(dias[2]).toMatchObject({ nombre: 'Miércoles', fechaCorta: '16/9', esHoy: true })
    expect(dias.filter((d) => d.esHoy)).toHaveLength(1)
  })

  it('combina plan, selección y estado de cierre de cada comida', () => {
    const dias = armarSemanaPersona({
      ...base,
      selecciones: [{ fecha: '2026-09-16', comida: 'cena', estado: 'tarde', nota: '20:00', origen: 'persona' }],
    })
    expect(dias[2].comidas).toEqual([
      { comida: 'desayuno', valor: null, plan: null, abierta: false, cierre: 'cerrada' },
      {
        comida: 'almuerzo',
        valor: { estado: 'si', nota: null, origen: 'plan' },
        plan: { estado: 'si', nota: null },
        abierta: true,
        cierre: 'cierra hoy 10:00',
      },
      {
        comida: 'cena',
        valor: { estado: 'tarde', nota: '20:00', origen: 'persona' },
        plan: { estado: 'temprano', nota: '19:00' },
        abierta: true,
        cierre: 'cierra hoy 16:00',
      },
    ])
  })

  it('una comida cerrada sin selección queda sin definir; con selección congelada la conserva', () => {
    const dias = armarSemanaPersona({
      ...base,
      selecciones: [{ fecha: '2026-09-14', comida: 'almuerzo', estado: 'no', nota: null, origen: 'plan' }],
      cerradas: [
        { fecha: '2026-09-14', comida: 'almuerzo' },
        { fecha: '2026-09-14', comida: 'cena' },
      ],
    })
    expect(dias[0].comidas[1]).toMatchObject({ valor: { estado: 'no', nota: null, origen: 'plan' }, abierta: false })
    expect(dias[0].comidas[2]).toEqual({
      comida: 'cena',
      valor: null,
      plan: { estado: 'no', nota: null },
      abierta: false,
      cierre: 'cerrada',
    })
  })
})

describe('armarDiaAdministracion', () => {
  const datos = armarDiaAdministracion({
    fecha: '2026-09-16',
    personas: [
      { id: 'a', nombre: 'Ana' },
      { id: 'b', nombre: 'Beto' },
      { id: 'c', nombre: 'Carla' },
    ],
    planes: [
      { usuario_id: 'a', dia_semana: 3, comida: 'desayuno', estado: 'si', nota: null },
      { usuario_id: 'a', dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null },
      { usuario_id: 'a', dia_semana: 4, comida: 'cena', estado: 'no', nota: null },
      { usuario_id: 'b', dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null },
    ],
    selecciones: [
      { usuario_id: 'b', fecha: '2026-09-16', comida: 'almuerzo', estado: 'tarde', nota: '13:30', origen: 'persona' },
      { usuario_id: 'c', fecha: '2026-09-17', comida: 'almuerzo', estado: 'no', nota: null, origen: 'persona' },
    ],
    cerradas: [{ fecha: '2026-09-16', comida: 'desayuno' }],
  })

  it('calcula el valor efectivo de cada persona en el orden recibido', () => {
    expect(datos.filas.map((f) => f.nombre)).toEqual(['Ana', 'Beto', 'Carla'])
    expect(datos.filas[0].valores).toEqual({ desayuno: null, almuerzo: { estado: 'si', nota: null, origen: 'plan' }, cena: null })
    expect(datos.filas[1].valores.almuerzo).toEqual({ estado: 'tarde', nota: '13:30', origen: 'persona' })
    expect(datos.filas[2].valores).toEqual({ desayuno: null, almuerzo: null, cena: null })
  })

  it('resume cada comida', () => {
    expect(textoResumen(datos.resumen.desayuno)).toBe('3 sin definir')
    expect(textoResumen(datos.resumen.almuerzo)).toBe('1 sí · 1 tarde (13:30) · 1 sin definir')
    expect(datos.resumen.cena.total).toBe(3)
  })
})

describe('valorTrasGuardar', () => {
  it('igual al plan queda como "según tu plan"', () => {
    expect(valorTrasGuardar({ estado: 'si', nota: null }, { estado: 'si', nota: null })).toEqual({ estado: 'si', nota: null, origen: 'plan' })
  })

  it('distinta nota o sin plan queda como cambio de la persona', () => {
    expect(valorTrasGuardar({ estado: 'tarde', nota: '13:30' }, { estado: 'tarde', nota: '14:00' }).origen).toBe('persona')
    expect(valorTrasGuardar(null, { estado: 'no', nota: null }).origen).toBe('persona')
  })
})
```

- [ ] **Paso 2: Correr y verificar que falla**

Run: `npm test -- tests/unit/comidas/vista`
Esperado: FAIL con `Failed to resolve import "@/lib/comidas/vista"`.

- [ ] **Paso 3: Implementar `lib/comidas/vista.ts`**

```ts
import { diaSemana, fechaISOEn, type FechaISO } from '@/lib/fechas'
import { estaAbierta, valorEfectivo } from './reglas'
import { resumenComida, type ResumenComida } from './resumen'
import { diasDeSemana, fechaCorta, nombreDia, textoCierre } from './semana'
import {
  TIEMPOS_COMIDA,
  type EstadoComida,
  type HorasLimite,
  type OrigenSeleccion,
  type SeleccionGuardada,
  type TiempoComida,
  type ValorComida,
  type ValorEfectivo,
} from './tipos'

/** Plan de una persona: plan[díaDeSemana 1..7][comida]. Serializable (se pasa al cliente). */
export type PlanSemanal = Partial<Record<number, Partial<Record<TiempoComida, ValorComida>>>>

/** Filas tal como las devuelve Supabase. */
export type FilaPlan = { dia_semana: number; comida: TiempoComida; estado: EstadoComida; nota: string | null }
export type FilaSeleccion = {
  fecha: FechaISO
  comida: TiempoComida
  estado: EstadoComida
  nota: string | null
  origen: OrigenSeleccion
}
export type FilaCerrada = { fecha: FechaISO; comida: TiempoComida }

/** Semana (Director, Residente). `cierre` ya viene como texto: 'cierra hoy 10:00' o 'cerrada'. */
export type ComidaDeSemana = {
  comida: TiempoComida
  valor: ValorEfectivo
  plan: ValorComida | null
  abierta: boolean
  cierre: string
}
export type DiaDeSemana = { fecha: FechaISO; nombre: string; fechaCorta: string; esHoy: boolean; comidas: ComidaDeSemana[] }

/** Administración */
export type Persona = { id: string; nombre: string }
export type PersonaConPlan = Persona & { plan: PlanSemanal }
export type FilaDiaAdministracion = Persona & { valores: Record<TiempoComida, ValorEfectivo> }
export type DiaAdministracion = {
  fecha: FechaISO
  filas: FilaDiaAdministracion[]
  resumen: Record<TiempoComida, ResumenComida>
}

function clave(fecha: FechaISO, comida: TiempoComida): string {
  return `${fecha}|${comida}`
}

function aSeleccion(fila: FilaSeleccion | undefined): SeleccionGuardada | null {
  return fila ? { estado: fila.estado, nota: fila.nota, origen: fila.origen } : null
}

export function planDesdeFilas(filas: FilaPlan[]): PlanSemanal {
  const plan: PlanSemanal = {}
  for (const fila of filas) {
    const dia = (plan[fila.dia_semana] ??= {})
    dia[fila.comida] = { estado: fila.estado, nota: fila.nota }
  }
  return plan
}

export function armarSemanaPersona(p: {
  lunes: FechaISO
  ahora: Date
  horas: HorasLimite
  plan: PlanSemanal
  selecciones: FilaSeleccion[]
  cerradas: FilaCerrada[]
}): DiaDeSemana[] {
  const hoy = fechaISOEn(p.ahora)
  const selecciones = new Map(p.selecciones.map((fila) => [clave(fila.fecha, fila.comida), fila]))
  const cerradas = new Set(p.cerradas.map((fila) => clave(fila.fecha, fila.comida)))

  return diasDeSemana(p.lunes).map((fecha) => ({
    fecha,
    nombre: nombreDia(fecha),
    fechaCorta: fechaCorta(fecha),
    esHoy: fecha === hoy,
    comidas: TIEMPOS_COMIDA.map((comida) => {
      const cerrada = cerradas.has(clave(fecha, comida))
      const plan = p.plan[diaSemana(fecha)]?.[comida] ?? null
      const momento = { fecha, comida, ahora: p.ahora, horas: p.horas, cerrada }
      return {
        comida,
        valor: valorEfectivo({ seleccion: aSeleccion(selecciones.get(clave(fecha, comida))), plan, cerrada }),
        plan,
        abierta: estaAbierta(momento),
        cierre: textoCierre(momento),
      }
    }),
  }))
}

export function armarDiaAdministracion(p: {
  fecha: FechaISO
  personas: Persona[]
  planes: (FilaPlan & { usuario_id: string })[]
  selecciones: (FilaSeleccion & { usuario_id: string })[]
  cerradas: FilaCerrada[]
}): DiaAdministracion {
  const dia = diaSemana(p.fecha)
  const cerradas = new Set(p.cerradas.filter((fila) => fila.fecha === p.fecha).map((fila) => fila.comida))

  const filas = p.personas.map((persona) => {
    const valores = {} as Record<TiempoComida, ValorEfectivo>
    for (const comida of TIEMPOS_COMIDA) {
      const seleccion = p.selecciones.find(
        (fila) => fila.usuario_id === persona.id && fila.fecha === p.fecha && fila.comida === comida,
      )
      const plan = p.planes.find(
        (fila) => fila.usuario_id === persona.id && fila.dia_semana === dia && fila.comida === comida,
      )
      valores[comida] = valorEfectivo({
        seleccion: aSeleccion(seleccion),
        plan: plan ? { estado: plan.estado, nota: plan.nota } : null,
        cerrada: cerradas.has(comida),
      })
    }
    return { id: persona.id, nombre: persona.nombre, valores }
  })

  const resumen = {} as Record<TiempoComida, ResumenComida>
  for (const comida of TIEMPOS_COMIDA) resumen[comida] = resumenComida(filas.map((fila) => fila.valores[comida]))

  return { fecha: p.fecha, filas, resumen }
}

/** Valor optimista tras guardar: igual que guardar_seleccion, si coincide con el plan no es excepción. */
export function valorTrasGuardar(plan: ValorComida | null, valor: ValorComida): SeleccionGuardada {
  const igualAlPlan = plan !== null && plan.estado === valor.estado && plan.nota === valor.nota
  return { estado: valor.estado, nota: valor.nota, origen: igualAlPlan ? 'plan' : 'persona' }
}
```

- [ ] **Paso 4: Correr y verificar que pasa**

Run: `npm test -- tests/unit/comidas/vista`
Esperado: PASS (8 pruebas).

- [ ] **Paso 5: Commit**

```bash
git add lib/comidas/vista.ts tests/unit/comidas/vista.test.ts
git commit -m "feat(comidas): armado de la semana propia y del día para Administración"
```

---
### Tarea 6: Validación zod de plan y selección

**Archivos:**
- Crear: `lib/validacion/comidas.ts`
- Prueba: `tests/unit/comidas/validacion.test.ts`

Las acciones de Comidas no usan formularios (índice §3.3, "sin formulario"): reciben un objeto y lo validan con estos esquemas. La nota se valida con `notaValida` y sale normalizada con `normalizarNota` (Tarea 2).

- [ ] **Paso 1: Escribir la prueba que falla**

`tests/unit/comidas/validacion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { camposConError } from '@/lib/validacion/auth'
import { esquemaPlan, esquemaSeleccion, esquemaVolverAPlan } from '@/lib/validacion/comidas'

function camposInvalidos(esquema: z.ZodType, entrada: unknown): string[] {
  const resultado = esquema.safeParse(entrada)
  return resultado.success ? [] : Object.keys(camposConError(resultado.error))
}

const SELECCION = { fecha: '2026-09-23', comida: 'almuerzo', estado: 'tarde', nota: '13:30' }
const PLAN = { diaSemana: 3, comida: 'cena', estado: 'temprano', nota: '19:00' }

describe('esquemaSeleccion', () => {
  it('acepta y normaliza la nota', () => {
    expect(esquemaSeleccion.parse({ ...SELECCION, nota: ' 13:30:00 ' })).toEqual(SELECCION)
  })

  it('descarta la nota de los estados que no la llevan y acepta nota ausente', () => {
    expect(esquemaSeleccion.parse({ ...SELECCION, estado: 'si', nota: 'x' })).toEqual({ ...SELECCION, estado: 'si', nota: null })
    expect(esquemaSeleccion.parse({ fecha: '2026-09-23', comida: 'cena', estado: 'no' })).toEqual({
      fecha: '2026-09-23',
      comida: 'cena',
      estado: 'no',
      nota: null,
    })
  })

  it.each([
    ['fecha inexistente', { fecha: '2026-02-30' }, 'fecha'],
    ['comida desconocida', { comida: 'merienda' }, 'comida'],
    ['estado desconocido', { estado: 'quizas' }, 'estado'],
    ['tarde sin hora', { nota: null }, 'nota'],
    ['tarde con hora inválida', { nota: '25:00' }, 'nota'],
    ['enfermo con 201 caracteres', { estado: 'enfermo', nota: 'x'.repeat(201) }, 'nota'],
    ['nota que no es texto', { nota: 1330 }, 'nota'],
  ])('rechaza %s', (_caso, cambio, campo) => {
    expect(camposInvalidos(esquemaSeleccion, { ...SELECCION, ...cambio })).toEqual([campo])
  })
})

describe('esquemaPlan', () => {
  it('acepta un día con estado y nota', () => {
    expect(esquemaPlan.parse(PLAN)).toEqual(PLAN)
  })

  it('estado null (Sin definir) descarta la nota', () => {
    expect(esquemaPlan.parse({ ...PLAN, estado: null, nota: '10:00' })).toEqual({ ...PLAN, estado: null, nota: null })
  })

  it.each([
    ['día 0', { diaSemana: 0 }, 'diaSemana'],
    ['día 8', { diaSemana: 8 }, 'diaSemana'],
    ['día con decimales', { diaSemana: 2.5 }, 'diaSemana'],
    ['día como texto', { diaSemana: '3' }, 'diaSemana'],
    ['temprano sin hora', { nota: '' }, 'nota'],
  ])('rechaza %s', (_caso, cambio, campo) => {
    expect(camposInvalidos(esquemaPlan, { ...PLAN, ...cambio })).toEqual([campo])
  })
})

describe('esquemaVolverAPlan', () => {
  it('acepta fecha y comida', () => {
    expect(esquemaVolverAPlan.parse({ fecha: '2026-09-23', comida: 'almuerzo' })).toEqual({ fecha: '2026-09-23', comida: 'almuerzo' })
  })

  it('rechaza una fecha inválida', () => {
    expect(camposInvalidos(esquemaVolverAPlan, { fecha: '23/09/2026', comida: 'almuerzo' })).toEqual(['fecha'])
  })
})
```

- [ ] **Paso 2: Correr y verificar que falla**

Run: `npm test -- tests/unit/comidas/validacion`
Esperado: FAIL con `Failed to resolve import "@/lib/validacion/comidas"`.

- [ ] **Paso 3: Implementar `lib/validacion/comidas.ts`**

En zod 4, `superRefine` no se ejecuta si el objeto ya tiene errores de tipo en sus campos. Por eso `INFO_ESTADO[estado]` siempre recibe un estado válido.

```ts
import { z } from 'zod'
import { mensajeNota, normalizarNota, notaValida } from '@/lib/comidas/notas'
import { ESTADOS_COMIDA, TIEMPOS_COMIDA } from '@/lib/comidas/tipos'

const fecha = z.iso.date('Fecha inválida.')
const comida = z.enum(TIEMPOS_COMIDA, 'Comida inválida.')
const estado = z.enum(ESTADOS_COMIDA, 'Elegí una opción válida.')
const nota = z.string('Nota inválida.').nullish()
const MENSAJE_DIA = 'Día inválido.'

/** Selección de una comida en Semana (spec §6.4). */
export const esquemaSeleccion = z
  .object({ fecha, comida, estado, nota })
  .superRefine((valor, ctx) => {
    if (!notaValida(valor.estado, normalizarNota(valor.estado, valor.nota))) {
      ctx.addIssue({ code: 'custom', path: ['nota'], message: mensajeNota(valor.estado) })
    }
  })
  .transform((valor) => ({ ...valor, nota: normalizarNota(valor.estado, valor.nota) }))

/** Una celda del Plan semanal. `estado: null` = "Sin definir" (borra la fila). */
export const esquemaPlan = z
  .object({
    diaSemana: z.number(MENSAJE_DIA).int(MENSAJE_DIA).min(1, MENSAJE_DIA).max(7, MENSAJE_DIA),
    comida,
    estado: estado.nullable(),
    nota,
  })
  .superRefine((valor, ctx) => {
    if (valor.estado !== null && !notaValida(valor.estado, normalizarNota(valor.estado, valor.nota))) {
      ctx.addIssue({ code: 'custom', path: ['nota'], message: mensajeNota(valor.estado) })
    }
  })
  .transform((valor) => ({
    ...valor,
    nota: valor.estado === null ? null : normalizarNota(valor.estado, valor.nota),
  }))

export const esquemaVolverAPlan = z.object({ fecha, comida })

export type DatosSeleccion = z.output<typeof esquemaSeleccion>
export type DatosPlan = z.output<typeof esquemaPlan>
```

- [ ] **Paso 4: Correr y verificar que pasa**

Run: `npm test`
Esperado: PASS; `tests/unit/comidas/validacion.test.ts` con 18 pruebas y el resto de las unitarias en verde.

- [ ] **Paso 5: Commit**

```bash
git add lib/validacion/comidas.ts tests/unit/comidas/validacion.test.ts
git commit -m "feat(comidas): validación zod de plan y selección"
```

---
### Tarea 7: Consultas del servidor

**Archivos:**
- Crear: `lib/comidas/consultas.ts`

Lee con la sesión del usuario (`crearClienteServidor`), así RLS aplica: cada persona solo recibe lo suyo y Administración recibe todo. Igual se filtra por `usuario_id` de forma explícita, para que un Director o Residente nunca mezcle filas ajenas si RLS cambiara. Todo el cálculo se delega en `vista.ts` (Tarea 5).

- [ ] **Paso 1: Escribir `lib/comidas/consultas.ts`**

```ts
import 'server-only'
import { diaSemana, horaHHMM, sumarDias, type FechaISO } from '@/lib/fechas'
import { listarPerfiles } from '@/lib/perfiles/consultas'
import { ROLES_CON_COMIDAS } from '@/lib/perfiles/roles'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { TIEMPOS_COMIDA, type HorasLimite } from './tipos'
import {
  armarDiaAdministracion,
  armarSemanaPersona,
  planDesdeFilas,
  type DiaAdministracion,
  type DiaDeSemana,
  type PersonaConPlan,
  type PlanSemanal,
} from './vista'

/** Las 3 horas límite vigentes (tabla horas_limite de la Fase 0). */
export async function obtenerHorasLimite(): Promise<HorasLimite> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('horas_limite').select('comida, dia_relativo, hora')
  if (error) throw error

  const horas = {} as HorasLimite
  for (const comida of TIEMPOS_COMIDA) {
    const fila = data.find((f) => f.comida === comida)
    if (!fila) throw new Error(`Falta la hora límite de ${comida}.`)
    horas[comida] = { diaRelativo: fila.dia_relativo === -1 ? -1 : 0, hora: horaHHMM(fila.hora) }
  }
  return horas
}

export async function obtenerPlanPropio(usuarioId: string): Promise<PlanSemanal> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('plan_semanal')
    .select('dia_semana, comida, estado, nota')
    .eq('usuario_id', usuarioId)
  if (error) throw error
  return planDesdeFilas(data)
}

/** Semana de lunes a domingo con el valor efectivo y el estado de cierre de cada comida. */
export async function obtenerSemanaPropia(usuarioId: string, lunes: FechaISO): Promise<DiaDeSemana[]> {
  const domingo = sumarDias(lunes, 6)
  const supabase = await crearClienteServidor()

  const [horas, plan, selecciones, cerradas] = await Promise.all([
    obtenerHorasLimite(),
    obtenerPlanPropio(usuarioId),
    supabase
      .from('selecciones_comida')
      .select('fecha, comida, estado, nota, origen')
      .eq('usuario_id', usuarioId)
      .gte('fecha', lunes)
      .lte('fecha', domingo),
    supabase.from('comidas_cerradas').select('fecha, comida').gte('fecha', lunes).lte('fecha', domingo),
  ])
  if (selecciones.error) throw selecciones.error
  if (cerradas.error) throw cerradas.error

  return armarSemanaPersona({
    lunes,
    ahora: new Date(),
    horas,
    plan,
    selecciones: selecciones.data,
    cerradas: cerradas.data,
  })
}

/** Plan semanal de cada Director/Residente activo (Administración, solo lectura). */
export async function obtenerPlanesDeTodos(): Promise<PersonaConPlan[]> {
  const supabase = await crearClienteServidor()
  const [personas, filas] = await Promise.all([
    listarPerfiles({ soloActivos: true, roles: ROLES_CON_COMIDAS }),
    supabase.from('plan_semanal').select('usuario_id, dia_semana, comida, estado, nota'),
  ])
  if (filas.error) throw filas.error

  return personas.map((persona) => ({
    id: persona.id,
    nombre: persona.nombre,
    plan: planDesdeFilas(filas.data.filter((fila) => fila.usuario_id === persona.id)),
  }))
}

/** Un día de la semana para Administración: valores de cada persona activa y resumen por comida. */
export async function obtenerDiaParaAdministracion(fecha: FechaISO): Promise<DiaAdministracion> {
  const supabase = await crearClienteServidor()
  const [personas, planes, selecciones, cerradas] = await Promise.all([
    listarPerfiles({ soloActivos: true, roles: ROLES_CON_COMIDAS }),
    supabase
      .from('plan_semanal')
      .select('usuario_id, dia_semana, comida, estado, nota')
      .eq('dia_semana', diaSemana(fecha)),
    supabase.from('selecciones_comida').select('usuario_id, fecha, comida, estado, nota, origen').eq('fecha', fecha),
    supabase.from('comidas_cerradas').select('fecha, comida').eq('fecha', fecha),
  ])
  if (planes.error) throw planes.error
  if (selecciones.error) throw selecciones.error
  if (cerradas.error) throw cerradas.error

  return armarDiaAdministracion({
    fecha,
    personas,
    planes: planes.data,
    selecciones: selecciones.data,
    cerradas: cerradas.data,
  })
}
```

- [ ] **Paso 2: Verificar tipos y lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores. Si `typecheck` marca que `estado` u `origen` no son asignables, revisar que la Tarea 1 regeneró los tipos. Los enums `estado_comida` y `origen_seleccion` generados son las mismas uniones de texto que `EstadoComida` y `OrigenSeleccion`.

- [ ] **Paso 3: Commit**

```bash
git add lib/comidas/consultas.ts
git commit -m "feat(comidas): consultas de plan, semana propia y día para Administración"
```

---
### Tarea 8: Server Actions

**Archivos:**
- Crear: `app/(app)/comidas/acciones.ts`

Siguen el índice §3.3 ("sin formulario"): `perfilParaAccion('director', 'residente')` → zod → escribir con la sesión del usuario → `revalidatePath('/comidas', 'layout')` → `exito(null)`. El `'layout'` revalida `/comidas/plan` y `/comidas/semana` a la vez.

**Traducción de errores (spec §6.4, §9.1):**

| Código | Origen | Mensaje |
|---|---|---|
| `MOL01` | `guardar_seleccion`, `volver_a_plan` | `mensajeComidaCerrada` con las horas límite vigentes: "El almuerzo ya cerró a las 10:00." o "Solo podés cambiar la semana actual y la siguiente." |
| `MOL04`, `23514` | RPC o CHECK `nota_valida` | `mensajeNota(estado)` |
| `42501` | rol o RLS | "No tenés permiso para hacer esto." |
| otro | — | `console.error` y "No se pudo guardar. Intentá de nuevo." |

**Sobre `p_nota`:** los tipos que genera Supabase declaran los argumentos `text` de una función como `string`, aunque la función acepte `null`. Si en `database.types.ts` (Tarea 1, Paso 4) `p_nota` ya admite `null`, quitar el `as string`.

- [ ] **Paso 1: Escribir `app/(app)/comidas/acciones.ts`**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { obtenerHorasLimite } from '@/lib/comidas/consultas'
import { mensajeNota } from '@/lib/comidas/notas'
import { mensajeComidaCerrada } from '@/lib/comidas/semana'
import type { EstadoComida, TiempoComida } from '@/lib/comidas/tipos'
import type { FechaISO } from '@/lib/fechas'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'
import { esquemaPlan, esquemaSeleccion, esquemaVolverAPlan } from '@/lib/validacion/comidas'

const ERROR_GENERAL = 'No se pudo guardar. Intentá de nuevo.'

type ErrorBase = { code?: string; message?: string }

function falloDeValidacion(error: Parameters<typeof camposConError>[0]) {
  const campos = camposConError(error)
  return fallo(Object.values(campos)[0] ?? 'Datos inválidos.', campos)
}

async function mensajeDeError(
  error: ErrorBase,
  datos: { fecha?: FechaISO; comida: TiempoComida; estado?: EstadoComida | null },
): Promise<string> {
  switch (error.code) {
    case 'MOL01':
      return datos.fecha
        ? mensajeComidaCerrada({ fecha: datos.fecha, comida: datos.comida, ahora: new Date(), horas: await obtenerHorasLimite() })
        : ERROR_GENERAL
    case 'MOL04':
    case '23514':
      return datos.estado ? mensajeNota(datos.estado) : ERROR_GENERAL
    case '42501':
      return 'No tenés permiso para hacer esto.'
    default:
      console.error('Comidas: error al guardar', error)
      return ERROR_GENERAL
  }
}

/** Una celda del Plan semanal propio. `estado: null` borra la fila (spec §6.5). */
export async function guardarPlan(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director', 'residente')
  if (!permiso.ok) return permiso

  const datos = esquemaPlan.safeParse(entrada)
  if (!datos.success) return falloDeValidacion(datos.error)

  const { diaSemana, comida, estado, nota } = datos.data
  const clave = { usuario_id: permiso.perfil.id, dia_semana: diaSemana, comida }
  const supabase = await crearClienteServidor()

  const { error } =
    estado === null
      ? await supabase.from('plan_semanal').delete().match(clave)
      : await supabase
          .from('plan_semanal')
          .upsert({ ...clave, estado, nota }, { onConflict: 'usuario_id,dia_semana,comida' })
  if (error) return fallo(await mensajeDeError(error, { comida, estado }))

  revalidatePath('/comidas', 'layout')
  return exito(null)
}

/** Selección de una comida de la semana actual o la siguiente (spec §6.4). */
export async function guardarSeleccion(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director', 'residente')
  if (!permiso.ok) return permiso

  const datos = esquemaSeleccion.safeParse(entrada)
  if (!datos.success) return falloDeValidacion(datos.error)

  const { fecha, comida, estado, nota } = datos.data
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('guardar_seleccion', {
    p_fecha: fecha,
    p_comida: comida,
    p_estado: estado,
    // La función acepta null; los tipos generados declaran text como string.
    p_nota: nota as string,
  })
  if (error) return fallo(await mensajeDeError(error, { fecha, comida, estado }))

  revalidatePath('/comidas', 'layout')
  return exito(null)
}

/** Borra el cambio de la persona y vuelve a su plan (spec §6.4). */
export async function volverAPlan(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director', 'residente')
  if (!permiso.ok) return permiso

  const datos = esquemaVolverAPlan.safeParse(entrada)
  if (!datos.success) return falloDeValidacion(datos.error)

  const { fecha, comida } = datos.data
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('volver_a_plan', { p_fecha: fecha, p_comida: comida })
  if (error) return fallo(await mensajeDeError(error, { fecha, comida }))

  revalidatePath('/comidas', 'layout')
  return exito(null)
}
```

- [ ] **Paso 2: Verificar tipos y lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores. En un archivo `'use server'` solo se exportan funciones `async`; `mensajeDeError` y `falloDeValidacion` no se exportan.

- [ ] **Paso 3: Commit**

```bash
git add "app/(app)/comidas/acciones.ts"
git commit -m "feat(comidas): acciones para guardar plan, selección y volver al plan"
```

---
### Tarea 9: Estilos, layout con pestañas, insignia y pantalla de error

**Archivos:**
- Modificar: `app/globals.css`
- Crear: `app/(app)/comidas/layout.tsx`, `app/(app)/comidas/error.tsx`, `app/(app)/comidas/_componentes/pestanas.tsx`, `app/(app)/comidas/_componentes/insignia-estado.tsx`

- [ ] **Paso 1: Agregar estilos al final de `app/globals.css`**

Se basan en las clases del prototipo (`.tabs`, `.plan-grid`, `.day-row`, `.status-chip`, `.admin-week-table`, `--st-<estado>`) y agregan solo lo que falta: pestañas y chips como enlaces, lista por día del plan en celular, filas de comida dentro de cada día, selector de día y resaltado de excepciones.

```css
/* ---------- Comidas (pista 02) ---------- */
a.tab-btn{text-decoration:none;display:inline-block;}
a.icon-btn,a.status-chip{text-decoration:none;}
a.icon-btn{display:inline-flex;align-items:center;justify-content:center;}
.icon-btn[aria-disabled="true"]{opacity:0.35;pointer-events:none;}
.week-nav .btn{margin-left:auto;}

.plan-grid .celda-comida{display:none;font-size:11.5px;font-weight:600;color:var(--ink-soft);margin-bottom:5px;}
.plan-grid .nota-plan{margin-top:6px;}
.plan-grid .nota-plan input{width:100%;padding:5px 7px;font-size:12px;border:1px solid var(--line);border-radius:3px;background:var(--bg);color:var(--ink);}
.plan-linea{font-size:10.5px;margin-bottom:3px;white-space:nowrap;}
.plan-linea .plan-letra{font-weight:600;color:var(--ink-soft);margin-right:3px;}
.plan-linea .status-badge{padding:1px 6px;}
.plan-linea .status-note{display:inline;margin-left:4px;}
@media (max-width:640px){
  .plan-grid{display:flex;flex-direction:column;}
  .plan-grid .meal-label,.plan-grid .esquina{display:none;}
  .plan-grid .head{text-align:left;}
  .plan-grid .celda-comida{display:block;}
}

.comida-fila{padding:10px 0;border-top:1px solid var(--line);}
.day-row-top + .comida-fila{border-top:none;padding-top:0;}
.comida-fila-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:8px;}
.comida-nombre{font-size:13px;font-weight:600;}
.origen-cambiada{color:var(--accent);font-weight:600;}
.editor-nota{display:flex;flex-wrap:wrap;align-items:center;gap:8px;}
.editor-nota label{font-size:12px;color:var(--ink-soft);}
.editor-nota input{flex:1 1 140px;}
.acciones-comida{margin-top:8px;}

.selector-dia{margin-bottom:18px;}
.selector-dia .status-chip.selected{background:var(--accent);color:var(--accent-ink);border-color:transparent;}
.resumen-comidas{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:18px;}
.resumen-comidas .card{padding:14px 16px;}
.admin-week-table td.excepcion{background:var(--accent-soft);box-shadow:inset 3px 0 0 var(--accent);}
.admin-week-table td.sin-definir .status-note{color:var(--danger);font-weight:600;}
```

- [ ] **Paso 2: `app/(app)/comidas/_componentes/pestanas.tsx`**

Pestañas del prototipo (`renderComidas`) como enlaces: cada una es una ruta, así la pestaña activa sobrevive a recargas.

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PESTANAS = [
  { ruta: '/comidas/plan', etiqueta: 'Plan semanal' },
  { ruta: '/comidas/semana', etiqueta: 'Semana' },
] as const

export function PestanasComidas() {
  const ruta = usePathname()
  return (
    <nav className="tabs" aria-label="Comidas">
      {PESTANAS.map((pestana) => {
        const activa = ruta.startsWith(pestana.ruta)
        return (
          <Link
            key={pestana.ruta}
            href={pestana.ruta}
            className={`tab-btn${activa ? ' active' : ''}`}
            aria-current={activa ? 'page' : undefined}
          >
            {pestana.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
```

- [ ] **Paso 3: `app/(app)/comidas/_componentes/insignia-estado.tsx`**

Sin `'use client'`: lo usan tanto componentes de servidor (tablas de Administración) como de cliente (chips).

```tsx
import type { CSSProperties } from 'react'
import { INFO_ESTADO, type EstadoComida, type ValorComida } from '@/lib/comidas/tipos'

/** Colores del prototipo: --st-<estado> y --st-<estado>-bg. */
export function estiloEstado(estado: EstadoComida): CSSProperties {
  return { background: `var(--st-${estado}-bg)`, color: `var(--st-${estado})` }
}

export function InsigniaEstado({ valor }: { valor: ValorComida | null }) {
  if (!valor) return <span className="status-note">Sin definir</span>
  return (
    <>
      <span className="status-badge" style={estiloEstado(valor.estado)}>
        {INFO_ESTADO[valor.estado].etiqueta}
      </span>
      {valor.nota && <span className="status-note">{valor.nota}</span>}
    </>
  )
}
```

- [ ] **Paso 4: `app/(app)/comidas/layout.tsx`**

```tsx
import { exigirPerfil } from '@/lib/auth/sesion'
import { PestanasComidas } from './_componentes/pestanas'

export default async function LayoutComidas({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil()
  const esAdministracion = perfil.rol === 'administracion'

  return (
    <>
      <div className="page-head">
        <h1>Comidas</h1>
        <div className="desc">
          {esAdministracion
            ? 'Planes y selecciones de comida de la casa, en solo lectura.'
            : 'Tu plan habitual y lo que vas a comer cada día de la semana.'}
        </div>
      </div>
      <PestanasComidas />
      {children}
    </>
  )
}
```

- [ ] **Paso 5: `app/(app)/comidas/error.tsx`**

Queda dentro del layout: si falla una página, el encabezado y las pestañas siguen visibles.

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export default function ErrorComidas({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()

  return (
    <div className="card">
      <div className="empty-state">
        <p>No se pudieron cargar las comidas.</p>
        <button
          type="button"
          className="btn small"
          disabled={pendiente}
          onClick={() =>
            iniciar(() => {
              router.refresh()
              reset()
            })
          }
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Paso 6: Verificar tipos y lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores.

- [ ] **Paso 7: Commit**

```bash
git add app/globals.css "app/(app)/comidas/layout.tsx" "app/(app)/comidas/error.tsx" "app/(app)/comidas/_componentes/pestanas.tsx" "app/(app)/comidas/_componentes/insignia-estado.tsx"
git commit -m "feat(comidas): estilos, pestañas, insignia de estado y pantalla de error"
```

---
### Tarea 10: Plan semanal

**Archivos:**
- Crear: `app/(app)/comidas/_componentes/plan-editable.tsx`, `app/(app)/comidas/_componentes/plan-administracion.tsx`
- Modificar (reemplazo completo de la provisional): `app/(app)/comidas/plan/page.tsx`

- [ ] **Paso 1: `app/(app)/comidas/_componentes/plan-editable.tsx`**

Porta `renderPlanSemanal` y `buildStatusSelect`. En el HTML, cada día va seguido de sus 3 celdas y cada celda se ubica en la cuadrícula con `gridColumn`/`gridRow`. En celular, la cuadrícula pasa a `flex` (Tarea 9) y queda una lista por día. Cada celda guarda su último valor confirmado (`guardado`) para revertir si la acción falla.

```tsx
'use client'

import { Fragment, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { LARGO_MAXIMO_NOTA, mensajeNota, normalizarNota, notaValida } from '@/lib/comidas/notas'
import { NOMBRES_DIA } from '@/lib/comidas/semana'
import {
  ESTADOS_COMIDA,
  ETIQUETA_TIEMPO,
  INFO_ESTADO,
  TIEMPOS_COMIDA,
  type EstadoComida,
  type TiempoComida,
  type ValorComida,
} from '@/lib/comidas/tipos'
import type { PlanSemanal } from '@/lib/comidas/vista'
import { guardarPlan } from '../acciones'
import { estiloEstado } from './insignia-estado'

function CeldaPlan({ dia, comida, inicial }: { dia: number; comida: TiempoComida; inicial: ValorComida | null }) {
  const aviso = useAviso()
  const [guardado, setGuardado] = useState<ValorComida | null>(inicial)
  const [estado, setEstado] = useState<EstadoComida | ''>(inicial?.estado ?? '')
  const [nota, setNota] = useState(inicial?.nota ?? '')
  const [pendiente, iniciar] = useTransition()

  const nombre = `${NOMBRES_DIA[dia - 1]}, ${ETIQUETA_TIEMPO[comida].toLowerCase()}`
  const tipoNota = estado === '' ? null : INFO_ESTADO[estado].nota

  function guardar(nuevoEstado: EstadoComida | '', nuevaNota: string) {
    const notaFinal = nuevoEstado === '' ? null : normalizarNota(nuevoEstado, nuevaNota)
    // Un estado que lleva nota se guarda recién cuando la nota es válida.
    if (nuevoEstado !== '' && !notaValida(nuevoEstado, notaFinal)) return
    if ((guardado?.estado ?? '') === nuevoEstado && (guardado?.nota ?? null) === notaFinal) return

    const anterior = guardado
    iniciar(async () => {
      const resultado = await guardarPlan({
        diaSemana: dia,
        comida,
        estado: nuevoEstado === '' ? null : nuevoEstado,
        nota: notaFinal,
      })
      if (resultado.ok) {
        setGuardado(nuevoEstado === '' ? null : { estado: nuevoEstado, nota: notaFinal })
        aviso('Plan semanal actualizado')
        return
      }
      setEstado(anterior?.estado ?? '')
      setNota(anterior?.nota ?? '')
      aviso(resultado.error)
    })
  }

  function cambiarEstado(valor: string) {
    const nuevo = valor as EstadoComida | ''
    const mismaNota = nuevo !== '' && estado !== '' && INFO_ESTADO[nuevo].nota === INFO_ESTADO[estado].nota
    const nuevaNota = mismaNota ? nota : ''
    setEstado(nuevo)
    setNota(nuevaNota)
    guardar(nuevo, nuevaNota)
  }

  return (
    <div
      className="cell"
      style={{ gridColumn: dia + 1, gridRow: TIEMPOS_COMIDA.indexOf(comida) + 2 }}
      aria-busy={pendiente}
    >
      <div className="celda-comida" aria-hidden="true">
        {ETIQUETA_TIEMPO[comida]}
      </div>
      <select
        className="plan-status-select"
        aria-label={nombre}
        value={estado}
        style={estado === '' ? undefined : estiloEstado(estado)}
        onChange={(e) => cambiarEstado(e.target.value)}
      >
        <option value="">Sin definir</option>
        {ESTADOS_COMIDA.map((opcion) => (
          <option key={opcion} value={opcion}>
            {INFO_ESTADO[opcion].etiqueta}
          </option>
        ))}
      </select>
      {estado !== '' && tipoNota && (
        <div className="nota-plan">
          <input
            type={tipoNota === 'hora' ? 'time' : 'text'}
            aria-label={`${INFO_ESTADO[estado].ayudaNota ?? 'Nota'} (${nombre})`}
            maxLength={tipoNota === 'texto' ? LARGO_MAXIMO_NOTA : undefined}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onBlur={() => guardar(estado, nota)}
          />
          {!notaValida(estado, normalizarNota(estado, nota)) && <div className="hint">{mensajeNota(estado)}</div>}
        </div>
      )}
    </div>
  )
}

export function PlanEditable({ plan }: { plan: PlanSemanal }) {
  return (
    <div className="card plan-scroll">
      <div className="plan-grid">
        <div className="cell head esquina" style={{ gridColumn: 1, gridRow: 1 }} />
        {TIEMPOS_COMIDA.map((comida, i) => (
          <div key={comida} className="meal-label" style={{ gridColumn: 1, gridRow: i + 2 }}>
            {ETIQUETA_TIEMPO[comida]}
          </div>
        ))}
        {NOMBRES_DIA.map((nombreDia, i) => (
          <Fragment key={nombreDia}>
            <div className="cell head" style={{ gridColumn: i + 2, gridRow: 1 }}>
              {nombreDia}
            </div>
            {TIEMPOS_COMIDA.map((comida) => (
              <CeldaPlan key={comida} dia={i + 1} comida={comida} inicial={plan[i + 1]?.[comida] ?? null} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Paso 2: `app/(app)/comidas/_componentes/plan-administracion.tsx`**

Porta `renderPlanSemanalAdmin`: una fila por persona y, en cada día, una línea por comida con su insignia.

```tsx
import { NOMBRES_DIA } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA } from '@/lib/comidas/tipos'
import type { PersonaConPlan } from '@/lib/comidas/vista'
import { InsigniaEstado } from './insignia-estado'

export function PlanAdministracion({ personas }: { personas: PersonaConPlan[] }) {
  return (
    <>
      <div className="locked-banner">Vista de solo lectura. Cada persona define su propio patrón habitual de comidas.</div>
      <div className="card admin-table-scroll">
        {personas.length === 0 ? (
          <div className="empty-state">No hay Directores ni Residentes activos.</div>
        ) : (
          <table className="admin-week-table">
            <thead>
              <tr>
                <th scope="col">Persona</th>
                {NOMBRES_DIA.map((nombre) => (
                  <th key={nombre} scope="col">
                    {nombre.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {personas.map((persona) => (
                <tr key={persona.id}>
                  <td className="namecell">{persona.nombre}</td>
                  {NOMBRES_DIA.map((nombre, i) => (
                    <td key={nombre}>
                      {TIEMPOS_COMIDA.map((comida) => (
                        <div key={comida} className="plan-linea">
                          <span className="plan-letra" title={ETIQUETA_TIEMPO[comida]}>
                            {ETIQUETA_TIEMPO[comida].charAt(0)}:
                          </span>
                          <InsigniaEstado valor={persona.plan[i + 1]?.[comida] ?? null} />
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
```

- [ ] **Paso 3: Reemplazar `app/(app)/comidas/plan/page.tsx`**

```tsx
import { exigirPerfil } from '@/lib/auth/sesion'
import { obtenerPlanesDeTodos, obtenerPlanPropio } from '@/lib/comidas/consultas'
import { PlanAdministracion } from '../_componentes/plan-administracion'
import { PlanEditable } from '../_componentes/plan-editable'

export default async function PaginaPlanSemanal() {
  const perfil = await exigirPerfil()

  if (perfil.rol === 'administracion') {
    const personas = await obtenerPlanesDeTodos()
    return <PlanAdministracion personas={personas} />
  }

  const plan = await obtenerPlanPropio(perfil.id)
  return (
    <>
      <div className="locked-banner">
        Este es tu patrón habitual de comidas: se usa en cada semana mientras no cambies un día puntual. Los cambios se
        guardan solos.
      </div>
      <PlanEditable plan={plan} />
    </>
  )
}
```

- [ ] **Paso 4: Verificar build y lint**

```bash
npm run build && npm run lint
```

Esperado: build exitoso; `/comidas/plan` aparece como dinámica (`ƒ`); sin errores de lint.

- [ ] **Paso 5: Commit**

```bash
git add "app/(app)/comidas/_componentes/plan-editable.tsx" "app/(app)/comidas/_componentes/plan-administracion.tsx" "app/(app)/comidas/plan/page.tsx"
git commit -m "feat(comidas): plan semanal editable y tabla comparativa para Administración"
```

---

### Tarea 11: Semana de Director y Residente

**Archivos:**
- Crear: `app/(app)/comidas/_componentes/navegacion-semana.tsx`, `app/(app)/comidas/_componentes/comida-del-dia.tsx`, `app/(app)/comidas/_componentes/semana-persona.tsx`

- [ ] **Paso 1: `app/(app)/comidas/_componentes/navegacion-semana.tsx`**

Porta la barra `.week-nav` de `renderSemana` con enlaces `?semana=`. "›" queda deshabilitado en la semana siguiente. La usan todos los roles.

```tsx
import Link from 'next/link'
import { navegacionSemana, rangoSemana } from '@/lib/comidas/semana'
import type { FechaISO } from '@/lib/fechas'

const DESCRIPCION = { pasada: 'semana pasada', actual: 'semana actual', siguiente: 'semana siguiente' } as const

export function NavegacionSemana({ lunes, hoy }: { lunes: FechaISO; hoy: FechaISO }) {
  const { anterior, siguiente, tipo } = navegacionSemana(lunes, hoy)

  return (
    <div className="week-nav">
      <Link href={`/comidas/semana?semana=${anterior}`} className="icon-btn" aria-label="Semana anterior">
        ‹
      </Link>
      <div className="range">
        {rangoSemana(lunes)} · {DESCRIPCION[tipo]}
      </div>
      {siguiente ? (
        <Link href={`/comidas/semana?semana=${siguiente}`} className="icon-btn" aria-label="Semana siguiente">
          ›
        </Link>
      ) : (
        <span className="icon-btn" aria-disabled="true" aria-label="Semana siguiente (no disponible)">
          ›
        </span>
      )}
      {tipo !== 'actual' && (
        <Link href="/comidas/semana" className="btn ghost small">
          Ir a la semana actual
        </Link>
      )}
    </div>
  )
}
```

- [ ] **Paso 2: `app/(app)/comidas/_componentes/comida-del-dia.tsx`**

Una comida de un día: 6 chips con `aria-pressed`, origen ("según tu plan", "cambiada", "Sin definir"), texto de cierre, nota y "Volver a mi plan".
- **Sin nota** (sí, no, en bolsa): guarda al tocar.
- **Con nota** (temprano, tarde, enfermo): abre un editor con "Guardar" y "Cancelar".
- `useOptimistic` muestra el valor nuevo mientras la acción corre. Si falla, al terminar la transición vuelve solo al valor del servidor y se muestra el aviso. Si sale bien, `router.refresh()`.
- `data-fecha` y `data-comida` identifican la comida en el e2e.

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useId, useOptimistic, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import type { Resultado } from '@/lib/acciones/resultado'
import { LARGO_MAXIMO_NOTA, mensajeNota, normalizarNota, notaValida } from '@/lib/comidas/notas'
import {
  ESTADOS_COMIDA,
  ETIQUETA_TIEMPO,
  INFO_ESTADO,
  type EstadoComida,
  type ValorComida,
  type ValorEfectivo,
} from '@/lib/comidas/tipos'
import { valorTrasGuardar, type ComidaDeSemana } from '@/lib/comidas/vista'
import type { FechaISO } from '@/lib/fechas'
import { guardarSeleccion, volverAPlan } from '../acciones'
import { estiloEstado } from './insignia-estado'

function textoOrigen(valor: ValorEfectivo): string {
  if (!valor) return 'Sin definir'
  return valor.origen === 'persona' ? 'cambiada' : 'según tu plan'
}

export function ComidaDelDia({ fecha, etiquetaDia, datos }: { fecha: FechaISO; etiquetaDia: string; datos: ComidaDeSemana }) {
  const router = useRouter()
  const aviso = useAviso()
  const idNota = useId()
  const [valor, aplicarValor] = useOptimistic(datos.valor)
  const [borrador, setBorrador] = useState<{ estado: EstadoComida; nota: string } | null>(null)
  const [pendiente, iniciar] = useTransition()

  const nombre = ETIQUETA_TIEMPO[datos.comida]
  const editable = datos.abierta
  const estadoMarcado = borrador?.estado ?? valor?.estado ?? null

  function ejecutar(optimista: ValorEfectivo, accion: () => Promise<Resultado<null>>) {
    iniciar(async () => {
      aplicarValor(optimista)
      const resultado = await accion()
      if (!resultado.ok) {
        aviso(resultado.error)
        return
      }
      setBorrador(null)
      router.refresh()
    })
  }

  function guardar(nuevo: ValorComida) {
    ejecutar(valorTrasGuardar(datos.plan, nuevo), () =>
      guardarSeleccion({ fecha, comida: datos.comida, estado: nuevo.estado, nota: nuevo.nota }),
    )
  }

  function elegir(estado: EstadoComida) {
    if (INFO_ESTADO[estado].nota) {
      setBorrador({ estado, nota: valor?.estado === estado ? (valor.nota ?? '') : '' })
      return
    }
    setBorrador(null)
    if (valor?.estado === estado) return
    guardar({ estado, nota: null })
  }

  function confirmarNota(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (!borrador) return
    const nota = normalizarNota(borrador.estado, borrador.nota)
    if (!notaValida(borrador.estado, nota)) {
      aviso(mensajeNota(borrador.estado))
      return
    }
    guardar({ estado: borrador.estado, nota })
  }

  function volver() {
    ejecutar(datos.plan ? { ...datos.plan, origen: 'plan' } : null, () =>
      volverAPlan({ fecha, comida: datos.comida }),
    )
  }

  const tipoNota = borrador ? INFO_ESTADO[borrador.estado].nota : null

  return (
    <div
      className="comida-fila"
      role="group"
      aria-label={`${nombre}, ${etiquetaDia}`}
      data-fecha={fecha}
      data-comida={datos.comida}
    >
      <div className="comida-fila-top">
        <span className="comida-nombre">{nombre}</span>
        <span className="lock-note">
          <span className={valor?.origen === 'persona' ? 'origen-cambiada' : undefined}>{textoOrigen(valor)}</span>
          {' · '}
          {datos.cierre}
        </span>
      </div>

      <div className="status-row">
        {ESTADOS_COMIDA.map((estado) => {
          const marcado = estadoMarcado === estado
          return (
            <button
              key={estado}
              type="button"
              className={`status-chip${marcado ? ' selected' : ''}`}
              style={marcado ? estiloEstado(estado) : undefined}
              aria-pressed={marcado}
              disabled={!editable || pendiente}
              onClick={() => elegir(estado)}
            >
              {INFO_ESTADO[estado].etiqueta}
            </button>
          )
        })}
      </div>

      {editable && borrador ? (
        <form className="note-field editor-nota" onSubmit={confirmarNota}>
          <label htmlFor={idNota}>{tipoNota === 'hora' ? 'Hora' : 'Qué podés comer'}</label>
          <input
            id={idNota}
            type={tipoNota === 'hora' ? 'time' : 'text'}
            maxLength={tipoNota === 'texto' ? LARGO_MAXIMO_NOTA : undefined}
            value={borrador.nota}
            onChange={(e) => setBorrador({ ...borrador, nota: e.target.value })}
            required
          />
          <button type="submit" className="btn small" disabled={pendiente}>
            Guardar
          </button>
          <button type="button" className="btn ghost small" disabled={pendiente} onClick={() => setBorrador(null)}>
            Cancelar
          </button>
        </form>
      ) : (
        valor?.nota && (
          <div className="status-note">
            {INFO_ESTADO[valor.estado].nota === 'hora' ? `Hora: ${valor.nota}` : valor.nota}
          </div>
        )
      )}

      {editable && !borrador && valor?.origen === 'persona' && (
        <div className="acciones-comida">
          <button type="button" className="btn ghost small" disabled={pendiente} onClick={volver}>
            Volver a mi plan
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Paso 3: `app/(app)/comidas/_componentes/semana-persona.tsx`**

Porta `renderSemana`: una tarjeta `.day-row` por día (con `.today` en hoy) y las 3 comidas adentro. En semanas pasadas muestra el aviso de solo consulta. Todas las comidas ya vienen con `abierta: false`, así que los chips quedan deshabilitados.

```tsx
import type { TipoSemana } from '@/lib/comidas/semana'
import type { DiaDeSemana } from '@/lib/comidas/vista'
import { ComidaDelDia } from './comida-del-dia'

export function SemanaPersona({ dias, tipo }: { dias: DiaDeSemana[]; tipo: TipoSemana }) {
  return (
    <>
      {tipo === 'pasada' && (
        <div className="locked-banner">Semana pasada: solo consulta. Podés cambiar la semana actual y la siguiente.</div>
      )}
      <div className="week-list">
        {dias.map((dia) => {
          const etiqueta = `${dia.nombre} ${dia.fechaCorta}`
          return (
            <section key={dia.fecha} className={`day-row${dia.esHoy ? ' today' : ''}`} aria-label={etiqueta}>
              <div className="day-row-top">
                <div className="day-title">
                  <span className="dname">{dia.nombre}</span>
                  <span className="ddate">{dia.fechaCorta}</span>
                </div>
                {dia.esHoy && <span className="lock-note">Hoy</span>}
              </div>
              {dia.comidas.map((comida) => (
                <ComidaDelDia key={comida.comida} fecha={dia.fecha} etiquetaDia={etiqueta} datos={comida} />
              ))}
            </section>
          )
        })}
      </div>
    </>
  )
}
```

- [ ] **Paso 4: Verificar tipos y lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores. La página que usa estos componentes se escribe en la Tarea 12.

- [ ] **Paso 5: Commit**

```bash
git add "app/(app)/comidas/_componentes/navegacion-semana.tsx" "app/(app)/comidas/_componentes/comida-del-dia.tsx" "app/(app)/comidas/_componentes/semana-persona.tsx"
git commit -m "feat(comidas): semana propia con chips, notas y volver al plan"
```

---
### Tarea 12: Semana de Administración y página Semana

**Archivos:**
- Crear: `app/(app)/comidas/_componentes/refrescar-al-volver.tsx`, `app/(app)/comidas/_componentes/semana-administracion.tsx`
- Modificar (reemplazo completo de la provisional): `app/(app)/comidas/semana/page.tsx`

- [ ] **Paso 1: `app/(app)/comidas/_componentes/refrescar-al-volver.tsx`**

Spec §6.5: la vista de Administración se refresca cuando la app vuelve a primer plano.

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function RefrescarAlVolver() {
  const router = useRouter()

  useEffect(() => {
    function alCambiarVisibilidad() {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  }, [router])

  return null
}
```

- [ ] **Paso 2: `app/(app)/comidas/_componentes/semana-administracion.tsx`**

Reemplaza la matriz de la semana de `renderSemanaAdmin` por lo que pide el spec §6.5:
- selector de los 7 días (enlaces `?semana=&dia=`, con `aria-current="date"` en el elegido);
- resumen por comida (`data-resumen`);
- tabla de personas × 3 comidas (`data-comida` en cada celda), con excepciones resaltadas y "Sin definir" visible.

```tsx
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { ClaveResumen } from '@/lib/comidas/resumen'
import { diasDeSemana, etiquetaDia, fechaCorta, nombreDia } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA } from '@/lib/comidas/tipos'
import type { DiaAdministracion } from '@/lib/comidas/vista'
import type { FechaISO } from '@/lib/fechas'
import { estiloEstado, InsigniaEstado } from './insignia-estado'
import { RefrescarAlVolver } from './refrescar-al-volver'

const ESTILO_SIN_DEFINIR: CSSProperties = { background: 'var(--surface-2)', color: 'var(--danger)' }

function estiloParte(clave: ClaveResumen): CSSProperties {
  return clave === 'sin_definir' ? ESTILO_SIN_DEFINIR : estiloEstado(clave)
}

export function SemanaAdministracion({ lunes, hoy, datos }: { lunes: FechaISO; hoy: FechaISO; datos: DiaAdministracion }) {
  return (
    <>
      <RefrescarAlVolver />

      <nav className="status-row selector-dia" aria-label="Día">
        {diasDeSemana(lunes).map((fecha) => {
          const elegido = fecha === datos.fecha
          return (
            <Link
              key={fecha}
              href={`/comidas/semana?semana=${lunes}&dia=${fecha}`}
              className={`status-chip${elegido ? ' selected' : ''}`}
              aria-current={elegido ? 'date' : undefined}
            >
              {nombreDia(fecha).slice(0, 3)} {fechaCorta(fecha)}
              {fecha === hoy ? ' · hoy' : ''}
            </Link>
          )
        })}
      </nav>

      <div className="resumen-comidas">
        {TIEMPOS_COMIDA.map((comida) => {
          const { partes } = datos.resumen[comida]
          return (
            <div key={comida} className="card" data-resumen={comida}>
              <div className="section-title">{ETIQUETA_TIEMPO[comida]}</div>
              <div className="status-row">
                {partes.length === 0 ? (
                  <span className="status-note">Sin personas</span>
                ) : (
                  partes.map((parte) => (
                    <span key={parte.clave} className="status-badge" style={estiloParte(parte.clave)}>
                      {parte.texto}
                    </span>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card admin-table-scroll">
        <div className="section-title">{etiquetaDia(datos.fecha)}: selección por persona</div>
        {datos.filas.length === 0 ? (
          <div className="empty-state">No hay Directores ni Residentes activos.</div>
        ) : (
          <table className="admin-week-table">
            <thead>
              <tr>
                <th scope="col">Persona</th>
                {TIEMPOS_COMIDA.map((comida) => (
                  <th key={comida} scope="col">
                    {ETIQUETA_TIEMPO[comida]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.filas.map((fila) => (
                <tr key={fila.id}>
                  <td className="namecell">{fila.nombre}</td>
                  {TIEMPOS_COMIDA.map((comida) => {
                    const valor = fila.valores[comida]
                    const clase = !valor ? 'sin-definir' : valor.origen === 'persona' ? 'excepcion' : undefined
                    return (
                      <td key={comida} data-comida={comida} className={clase}>
                        <InsigniaEstado valor={valor} />
                        {valor?.origen === 'persona' && <span className="status-note">cambiada por la persona</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="hint" style={{ marginTop: 12 }}>
        Las celdas resaltadas son cambios respecto del plan semanal. Las selecciones las define cada persona y no se
        editan desde acá.
      </div>
    </>
  )
}
```

- [ ] **Paso 3: Reemplazar `app/(app)/comidas/semana/page.tsx`**

El servidor calcula hoy, la semana y el día con `lib/fechas`; los componentes reciben `FechaISO` y textos ya armados.

```tsx
import { exigirPerfil } from '@/lib/auth/sesion'
import { obtenerDiaParaAdministracion, obtenerSemanaPropia } from '@/lib/comidas/consultas'
import { diaPedido, semanaPedida, tipoSemana } from '@/lib/comidas/semana'
import { fechaISOEn } from '@/lib/fechas'
import { NavegacionSemana } from '../_componentes/navegacion-semana'
import { SemanaAdministracion } from '../_componentes/semana-administracion'
import { SemanaPersona } from '../_componentes/semana-persona'

export default async function PaginaSemana({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>
}) {
  const perfil = await exigirPerfil()
  const { semana, dia } = await searchParams

  const hoy = fechaISOEn(new Date())
  const lunes = semanaPedida(semana, hoy)

  if (perfil.rol === 'administracion') {
    const datos = await obtenerDiaParaAdministracion(diaPedido(dia, lunes, hoy))
    return (
      <>
        <NavegacionSemana lunes={lunes} hoy={hoy} />
        <SemanaAdministracion lunes={lunes} hoy={hoy} datos={datos} />
      </>
    )
  }

  const dias = await obtenerSemanaPropia(perfil.id, lunes)
  return (
    <>
      <NavegacionSemana lunes={lunes} hoy={hoy} />
      <SemanaPersona dias={dias} tipo={tipoSemana(lunes, hoy)} />
    </>
  )
}
```

- [ ] **Paso 4: Verificar build y lint**

```bash
npm run build && npm run lint
```

Esperado: build exitoso; `/comidas/plan` y `/comidas/semana` aparecen como dinámicas (`ƒ`); sin errores de lint.

- [ ] **Paso 5: Commit**

```bash
git add "app/(app)/comidas/_componentes/refrescar-al-volver.tsx" "app/(app)/comidas/_componentes/semana-administracion.tsx" "app/(app)/comidas/semana/page.tsx"
git commit -m "feat(comidas): semana de Administración con resumen, selector de día y refresco"
```

---
### Tarea 13: Sembrador demo y prueba manual

**Archivos:**
- Crear: `scripts/demo/comidas.ts`
- Modificar: `scripts/datos-demo.ts`

- [ ] **Paso 1: `scripts/demo/comidas.ts`**

Idempotente (`upsert`). Las dos excepciones se insertan directo con el cliente admin y `origen = 'persona'` (sin RPC, que exige sesión); caen en la semana siguiente, que siempre está dentro de la ventana.

```ts
import { TIEMPOS_COMIDA, type EstadoComida, type TiempoComida } from '@/lib/comidas/tipos'
import { fechaISOEn, lunesDe, sumarDias } from '@/lib/fechas'
import type { Database } from '@/lib/supabase/database.types'
import type { Sembrador } from './tipos'

type FilaPlan = Database['public']['Tables']['plan_semanal']['Insert']
type FilaSeleccion = Database['public']['Tables']['selecciones_comida']['Insert']
type Valor = { estado: EstadoComida; nota: string | null }

const SI: Valor = { estado: 'si', nota: null }
const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7]

/** Plan de los 7 días; `variante` devuelve null para dejar esa comida sin plan. */
function planDemo(usuarioId: string, variante: (dia: number, comida: TiempoComida) => Valor | null): FilaPlan[] {
  return DIAS_SEMANA.flatMap((dia) =>
    TIEMPOS_COMIDA.flatMap((comida) => {
      const valor = variante(dia, comida)
      return valor ? [{ usuario_id: usuarioId, dia_semana: dia, comida, ...valor }] : []
    }),
  )
}

export const sembrarComidas: Sembrador = async (admin, usuarios) => {
  const planes: FilaPlan[] = [
    ...planDemo(usuarios.residente, () => SI),
    // Sacerdote: cena temprano (19:00) de lunes a viernes.
    ...planDemo(usuarios.sacerdote, (dia, comida) =>
      comida === 'cena' && dia <= 5 ? { estado: 'temprano', nota: '19:00' } : SI,
    ),
    // Numerario: almuerzo en bolsa martes y jueves.
    ...planDemo(usuarios.numerario, (dia, comida) =>
      comida === 'almuerzo' && (dia === 2 || dia === 4) ? { estado: 'bolsa', nota: null } : SI,
    ),
    // Director: sin plan el sábado, para que existan comidas "Sin definir".
    ...planDemo(usuarios.director, (dia) => (dia === 6 ? null : SI)),
  ]

  const { error: errorPlan } = await admin
    .from('plan_semanal')
    .upsert(planes, { onConflict: 'usuario_id,dia_semana,comida' })
  if (errorPlan) throw errorPlan

  const { error: errorSabado } = await admin
    .from('plan_semanal')
    .delete()
    .eq('usuario_id', usuarios.director)
    .eq('dia_semana', 6)
  if (errorSabado) throw errorSabado

  const lunesSiguiente = sumarDias(lunesDe(fechaISOEn(new Date())), 7)
  const excepciones: FilaSeleccion[] = [
    {
      usuario_id: usuarios.residente,
      fecha: sumarDias(lunesSiguiente, 2),
      comida: 'almuerzo',
      estado: 'tarde',
      nota: '13:30',
      origen: 'persona',
    },
    {
      usuario_id: usuarios.numerario,
      fecha: sumarDias(lunesSiguiente, 4),
      comida: 'cena',
      estado: 'no',
      nota: null,
      origen: 'persona',
    },
  ]
  const { error: errorSelecciones } = await admin
    .from('selecciones_comida')
    .upsert(excepciones, { onConflict: 'usuario_id,fecha,comida' })
  if (errorSelecciones) throw errorSelecciones

  console.log(`  planes demo: ${planes.length} filas; excepciones en la semana del ${lunesSiguiente}: ${excepciones.length}`)
}
```

- [ ] **Paso 2: Registrar el sembrador en `scripts/datos-demo.ts`**

Agregar el import junto a los otros:

```ts
import { sembrarComidas } from './demo/comidas'
```

y la entrada en `SEMBRADORES`, conservando las que ya agregaron otras pistas:

```ts
const SEMBRADORES: { nombre: string; sembrar: Sembrador }[] = [
  { nombre: 'comidas', sembrar: sembrarComidas },
]
```

- [ ] **Paso 3: Verificar tipos y lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores.

- [ ] **Paso 4: Sembrar y probar a mano (solo antes del lanzamiento)**

El único proyecto Supabase es producción: esto crea datos `@demo.test`, que se borran con el script de limpieza de la Fase 0 antes de lanzar (plan 07).

```bash
npm run datos-demo -- --confirmar
```

Esperado: `Sembrando comidas…`, `planes demo: 81 filas; excepciones en la semana del <lunes siguiente>: 2` y `Listo.`. Ejecutarlo de nuevo da el mismo resultado sin duplicar.

```bash
npm run dev
```

En `http://localhost:3000`, con contraseña `demo-molino-2026`:

1. **`residente@demo.test` → Comidas → Semana:**
   - 7 días, con hoy resaltado;
   - cada comida dice "según tu plan" y "cierra hoy …", "cierra mañana …" o "cerrada", según la hora real;
   - tocar "No comer" en una comida abierta → "cambiada" y aparece "Volver a mi plan";
   - tocar "Volver a mi plan" → vuelve "según tu plan".
2. **"›" (semana siguiente):**
   - miércoles, Almuerzo: "Comer tarde", "Hora: 13:30" y "cambiada";
   - "›" queda deshabilitado.
3. **"‹" dos veces (semana pasada):** aviso "Semana pasada: solo consulta." y todos los chips deshabilitados.
4. **Tocar "Comer temprano" en una comida abierta:** aparece el campo "Hora".
   - "Guardar" sin hora → el navegador pide completar el campo;
   - con `12:15` → "cambiada" y "Hora: 12:15".
5. **Pestaña "Plan semanal":**
   - Lunes, cena → "Comer tarde": aparece el campo de hora y la ayuda;
   - escribir `20:30` y salir del campo → aviso "Plan semanal actualizado";
   - recargar: se conserva.
6. **Ancho de 375 px (DevTools):** el plan se ve como lista por día.
7. **`administracion@demo.test` → Plan semanal:** tabla con 4 personas; el sábado de "María Fernández (demo)" dice "Sin definir".
8. **Administración → Semana → "›" → "Mié":**
   - el resumen de Almuerzo incluye "1 tarde (13:30)";
   - la celda de almuerzo de "Juan Pérez (demo)" está resaltada y dice "cambiada por la persona".
9. **Con Administración en Semana**, cambiar a otra pestaña del navegador y volver: DevTools → Network muestra una nueva petición de `/comidas/semana`.

- [ ] **Paso 5: Commit**

```bash
git add scripts/demo/comidas.ts scripts/datos-demo.ts
git commit -m "feat(scripts): datos demo de planes y excepciones de comidas"
```

---
### Tarea 14: Pruebas de punta a punta

**Archivos:**
- Crear: `tests/e2e/comidas.spec.ts`

> Corren **solo en CI** (job `base-de-datos`), igual que `tests/e2e/login.spec.ts`. No ejecutar en local: la guardia `exigirBaseLocal()` aborta si la base no es local.

**Independencia del reloj (spec §9.2):**
- Se usa el almuerzo del miércoles de la semana siguiente: cierra ese mismo miércoles a las 10:00, así que siempre está abierto.
- `limpiar()` deja las horas límite por defecto y borra cierres de la semana siguiente en adelante, por si otra prueba los dejó.
- Las fechas se calculan con `lib/fechas` en zona El Salvador, igual que el servidor.
- Límite aceptado: si una prueba corre justo al pasar de domingo a lunes, la semana del test y la del servidor pueden no coincidir.

**Selectores:**
- Cada comida se ubica por `data-fecha` + `data-comida`, y dentro de ella por rol o texto.
- Nunca `getByRole('alert')`: Next.js agrega su propio anunciador de rutas con ese rol.

- [ ] **Paso 1: Escribir `tests/e2e/comidas.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test'
import { fechaISOEn, lunesDe, sumarDias } from '../../lib/fechas'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  CONTRASENA_PRUEBA,
  USUARIOS_PRUEBA,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'

let ids: Record<ClaveUsuario, string>

function fechas() {
  const lunesActual = lunesDe(fechaISOEn(new Date()))
  return {
    lunesPasado: sumarDias(lunesActual, -7),
    lunesSiguiente: sumarDias(lunesActual, 7),
    miercolesSiguiente: sumarDias(lunesActual, 9),
  }
}

/** '2026-09-23' → '23/9', igual que fechaCorta de lib/comidas/semana. */
function fechaCorta(fecha: string): string {
  const [, mes, dia] = fecha.split('-')
  return `${Number(dia)}/${Number(mes)}`
}

async function iniciarSesion(page: Page, clave: ClaveUsuario) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(USUARIOS_PRUEBA[clave].correo)
  await page.getByLabel('Contraseña').fill(CONTRASENA_PRUEBA)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
  await expect(page).toHaveURL(/\/comidas\/semana$/)
}

/** Borra planes y selecciones de los usuarios de prueba y deja horas límite y cierres futuros limpios. */
async function limpiar(): Promise<Record<ClaveUsuario, string>> {
  const usuarios = await asegurarUsuariosPrueba()
  const admin = clienteAdminPrueba()
  const resultados = await Promise.all([
    admin.from('selecciones_comida').delete().in('usuario_id', Object.values(usuarios)),
    admin.from('plan_semanal').delete().in('usuario_id', Object.values(usuarios)),
    admin.from('horas_limite').update({ dia_relativo: -1, hora: '21:00' }).eq('comida', 'desayuno'),
    admin.from('horas_limite').update({ dia_relativo: 0, hora: '10:00' }).eq('comida', 'almuerzo'),
    admin.from('horas_limite').update({ dia_relativo: 0, hora: '16:00' }).eq('comida', 'cena'),
    admin.from('comidas_cerradas').delete().gte('fecha', fechas().lunesSiguiente),
  ])
  for (const { error } of resultados) if (error) throw error
  return usuarios
}

async function planAlmuerzoMiercoles() {
  const { error } = await clienteAdminPrueba()
    .from('plan_semanal')
    .insert({ usuario_id: ids.residente, dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null })
  expect(error).toBeNull()
}

test.beforeEach(async () => {
  ids = await limpiar()
})

test.afterEach(async () => {
  await limpiar()
})

test('un residente cambia el almuerzo y Administración lo ve en Semana', async ({ page }) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  await planAlmuerzoMiercoles()

  // Residente
  await iniciarSesion(page, 'residente')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  const almuerzo = page.locator(`[data-fecha="${miercolesSiguiente}"][data-comida="almuerzo"]`)
  await expect(almuerzo.getByText('según tu plan', { exact: true })).toBeVisible()
  await expect(almuerzo.getByRole('button', { name: 'Sí comer' })).toHaveAttribute('aria-pressed', 'true')

  await almuerzo.getByRole('button', { name: 'Comer tarde' }).click()
  await almuerzo.getByLabel('Hora', { exact: true }).fill('13:30')
  await almuerzo.getByRole('button', { name: 'Guardar' }).click()

  await expect(almuerzo.getByText('cambiada', { exact: true })).toBeVisible()
  await expect(almuerzo.getByText('Hora: 13:30')).toBeVisible()
  await expect(almuerzo.getByRole('button', { name: 'Comer tarde' })).toHaveAttribute('aria-pressed', 'true')

  const admin = clienteAdminPrueba()
  await expect
    .poll(async () => {
      const { data } = await admin
        .from('selecciones_comida')
        .select('estado, nota, origen')
        .eq('usuario_id', ids.residente)
        .eq('fecha', miercolesSiguiente)
        .eq('comida', 'almuerzo')
      return data
    })
    .toEqual([{ estado: 'tarde', nota: '13:30', origen: 'persona' }])

  // Administración
  await page.context().clearCookies()
  await iniciarSesion(page, 'administracion')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}&dia=${miercolesSiguiente}`)
  await expect(page.getByRole('link', { name: `Mié ${fechaCorta(miercolesSiguiente)}`, exact: true })).toHaveAttribute(
    'aria-current',
    'date',
  )

  const resumen = page.locator('[data-resumen="almuerzo"]')
  await expect(resumen).toContainText('1 tarde (13:30)')
  await expect(resumen).toContainText('sin definir')

  const celda = page.getByRole('row', { name: /Residente Prueba/ }).locator('td[data-comida="almuerzo"]')
  await expect(celda).toContainText('Comer tarde')
  await expect(celda).toContainText('13:30')
  await expect(celda).toHaveClass(/\bexcepcion\b/)

  const celdaDirectora = page.getByRole('row', { name: /Directora Prueba/ }).locator('td[data-comida="almuerzo"]')
  await expect(celdaDirectora).toContainText('Sin definir')
})

test('en una semana pasada el residente no puede cambiar nada', async ({ page }) => {
  const { lunesPasado } = fechas()

  await iniciarSesion(page, 'residente')
  await page.goto(`/comidas/semana?semana=${lunesPasado}`)

  await expect(page.locator('.locked-banner')).toContainText('Semana pasada: solo consulta.')
  await expect(page.locator('.week-list .status-chip')).toHaveCount(7 * 3 * 6)
  await expect(page.locator('.week-list .status-chip:enabled')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Volver a mi plan' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ir a la semana actual' })).toBeVisible()
})

test('"Volver a mi plan" quita el cambio y restaura el plan', async ({ page }) => {
  const { lunesSiguiente, miercolesSiguiente } = fechas()
  await planAlmuerzoMiercoles()
  const admin = clienteAdminPrueba()
  const { error } = await admin.from('selecciones_comida').insert({
    usuario_id: ids.residente,
    fecha: miercolesSiguiente,
    comida: 'almuerzo',
    estado: 'no',
    nota: null,
    origen: 'persona',
  })
  expect(error).toBeNull()

  await iniciarSesion(page, 'residente')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  const almuerzo = page.locator(`[data-fecha="${miercolesSiguiente}"][data-comida="almuerzo"]`)
  await expect(almuerzo.getByText('cambiada', { exact: true })).toBeVisible()
  await expect(almuerzo.getByRole('button', { name: 'No comer' })).toHaveAttribute('aria-pressed', 'true')

  await almuerzo.getByRole('button', { name: 'Volver a mi plan' }).click()

  await expect(almuerzo.getByText('según tu plan', { exact: true })).toBeVisible()
  await expect(almuerzo.getByRole('button', { name: 'Sí comer' })).toHaveAttribute('aria-pressed', 'true')
  await expect(almuerzo.getByRole('button', { name: 'Volver a mi plan' })).toHaveCount(0)
  await expect
    .poll(async () => {
      const { data } = await admin.from('selecciones_comida').select('estado').eq('usuario_id', ids.residente)
      return data
    })
    .toEqual([])
})
```

- [ ] **Paso 2: Verificar tipos y lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores.

- [ ] **Paso 3: Commit**

```bash
git add tests/e2e/comidas.spec.ts
git commit -m "test(e2e): residente cambia una comida, Administración la ve y volver al plan"
```

---
### Tarea 15: Verificación final y PR de funcionalidad

**Archivos:** ninguno nuevo.

- [ ] **Paso 1: Verificación local completa**

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Esperado: todo en verde. `npm test` incluye:
- `tests/unit/comidas/notas.test.ts` (25)
- `tests/unit/comidas/resumen.test.ts` (7)
- `tests/unit/comidas/semana.test.ts` (42)
- `tests/unit/comidas/vista.test.ts` (8)
- `tests/unit/comidas/validacion.test.ts` (18)
- y las de la Fase 0 (`fechas`, `reglas`) sin cambios.

- [ ] **Paso 2: Revisar que no quedaron páginas provisionales de Comidas**

```bash
grep -rn "PaginaProvisional" "app/(app)/comidas" || echo "sin provisionales"
```

Esperado: `sin provisionales`.

- [ ] **Paso 3: Actualizar con `master`**

```bash
git fetch origin
git rebase origin/master
```

Si hay conflictos en `app/globals.css` o `scripts/datos-demo.ts` (otras pistas agregan bloques y sembradores), conservar **ambos** cambios, `git add` de los archivos y `git rebase --continue`. Si `master` trae una migración nueva, repetir `npm run db:tipos` y commitear los tipos. Si hubo conflictos o tipos nuevos, repetir el Paso 1.

- [ ] **Paso 4: Subir la rama y abrir el PR**

```bash
git push -u origin feat/comidas-funcionalidad
gh pr create --base master --title "Comidas B: plan semanal, semana y vista de Administración" --body "Plan: docs/superpowers/plans/2026-09-16-02b-comidas-funcionalidad.md. Requiere 02-A aplicada. Director y Residente editan su plan y su semana (actual y siguiente); Administración ve planes y el día con resumen en solo lectura. Errores MOL01/MOL04 traducidos a mensajes en español."
```

- [ ] **Paso 5: Esperar CI**

```bash
gh pr checks --watch
```

Esperado: `calidad` y `base-de-datos` en verde. Si falla:
1. `gh run view --log-failed` (el reporte de Playwright queda como artefacto `playwright-report`);
2. corregir, commitear y `git push`.

- [ ] **Paso 6: Confirmar el resultado de las pruebas de punta a punta**

```bash
gh run view "$(gh run list --branch feat/comidas-funcionalidad --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --log | grep -E "[0-9]+ (passed|failed|flaky)"
```

Esperado: una línea `N passed` que incluye las 3 pruebas de `comidas.spec.ts`, y ninguna con `failed` ni `flaky`.

- [ ] **Paso 7: Revisión y merge**

1. Pedir revisión al otro colaborador.
2. Si `master` avanzó, repetir el Paso 3, `git push --force-with-lease` y esperar CI.
3. Con aprobación y CI en verde, mergear en GitHub.
4. Verificar el despliegue:

```bash
gh run list --workflow desplegar.yml --branch master --limit 1
```

Esperado: `completed` / `success`.
