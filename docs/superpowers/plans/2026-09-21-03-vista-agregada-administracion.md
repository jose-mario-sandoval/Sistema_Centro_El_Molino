# Vista semanal agregada de Administración — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** reemplazar las dos tablas persona-por-persona que ve Administración en Comidas
(`SemanaAdministracion` y `PlanAdministracion`) por vistas agregadas: solo cantidades por día y
tiempo de comida, sin nombres, sin siglas, sin filas por persona. Las cenas extra confirmadas por el
enlace público (plan hermano 2) aparecen como una cifra aparte.

**Arquitectura:** no hay tablas nuevas. `resumenComida()` ya agrega sin nombres — el problema es que
hoy `armarDiaAdministracion()` también calcula y **envía al cliente** `filas` (persona por persona).
La solución es cortar esa fuga en la capa de consultas (nunca mandar `filas` al navegador de
Administración) y sumar una vista de semana completa en vez de un día con selector. El agregado de
cenas extra pasa por una función `security definer` nueva (Administración no tiene ni debe tener
acceso de lectura directo a `eventos`, `enlaces_confirmacion` ni `confirmaciones_extra`).

**Stack:** Next.js (App Router), TypeScript, `@supabase/supabase-js`, Vitest, Playwright, Postgres 17.

**Referencias:** spec [`docs/superpowers/specs/2026-09-21-eventos-mensajes-comidas-design.md`](../specs/2026-09-21-eventos-mensajes-comidas-design.md)
§4 · plan hermano [`2026-09-21-02-enlace-publico-cena-extra.md`](2026-09-21-02-enlace-publico-cena-extra.md)
(prerrequisito real: la Tarea 1 de este plan necesita que `enlaces_confirmacion`/`confirmaciones_extra`
ya existan — implementar este plan después de ese) · CLAUDE.md, sección de privacidad ("nunca se manda
al navegador lo que un rol no debe ver").

**Antes de empezar:**
- El plan de enlace público ya está mergeado y aplicado (Tarea 1 de este plan falla si no).
- Pruebas de integración y e2e: banco de pruebas local o CI.

---

## Decisiones de esta pista

- **`armarDiaAdministracion()` no cambia** (sigue calculando `filas` puertas adentro, la necesita para
  construir `resumen`). Lo que cambia es que ninguna función de `lib/comidas/consultas.ts` que sirve a
  Administración vuelve a devolver `filas` — se cortan explícitamente antes de cruzar al Server
  Component.
- **Vista de semana completa, no un día con selector**: la página dejará de aceptar `?dia=` para
  Administración (sigue existiendo para Director/Residente, que no cambian). El layout exacto (filas
  vs. columnas) se ajusta mirándolo en el navegador — no es una decisión de datos.
- **"Cenas extra" vía función `security definer` nueva** (`extras_de_la_semana`), no lectura directa:
  Administración no tiene RLS para leer `eventos` (política actual: "Director y Residente" solamente),
  así que no puede unir `confirmaciones_extra → enlaces_confirmacion → eventos` con una consulta
  normal. Mismo patrón que `eventos_para_cocina()`.
- **El plan habitual también se agrega** (decisión tomada con el usuario: mismo criterio que la otra
  tabla). Se agrega `resumenPlanSemanal()`, análoga a `resumenComida()` pero sobre `PersonaConPlan[]`.
- **Se borran** `semana-administracion.tsx` y `plan-administracion.tsx` — no quedan como código muerto
  ni como opción alternativa.

---

## Mapa de archivos

```
supabase/migrations/20260921201000_extras_administracion.sql   nuevo — función extras_de_la_semana
lib/comidas/resumen.ts                                          + totalQueComen()
lib/comidas/vista.ts                                             + DiaAgregado, agregarSemana(), resumenPlanSemanal()
lib/comidas/consultas.ts                                         + obtenerSemanaParaAdministracion(), obtenerExtrasDeLaSemana(), obtenerResumenPlanSemanal()
app/(app)/comidas/semana/page.tsx                                 rama Administración usa las funciones nuevas
app/(app)/comidas/plan/page.tsx                                   rama Administración usa la función nueva
app/(app)/comidas/_componentes/semana-agregada-administracion.tsx  nuevo — reemplaza semana-administracion.tsx
app/(app)/comidas/_componentes/plan-agregado-administracion.tsx    nuevo — reemplaza plan-administracion.tsx
app/(app)/comidas/_componentes/semana-administracion.tsx           eliminar
app/(app)/comidas/_componentes/plan-administracion.tsx             eliminar
tests/unit/comidas/resumen.test.ts                                totalQueComen()
tests/unit/comidas/vista.test.ts                                  agregarSemana(), resumenPlanSemanal()
tests/integration/comidas.test.ts                                 RLS de extras_de_la_semana
tests/e2e/comidas.spec.ts                                         reescribe los 3 tests que dependen de la tabla persona-por-persona
```

---

## Tareas

### Tarea 1: función `extras_de_la_semana`

**Archivos:**
- Crear: `supabase/migrations/20260921201000_extras_administracion.sql`
- Test: `tests/integration/comidas.test.ts`

- [ ] **Paso 1: escribir la migración**

```sql
-- =========================================================
-- Cenas extra de la semana para Administración: cuántas personas confirmaron
-- por día y tiempo de comida, sin nombres ni detalle de quién. Administración
-- no lee eventos ni enlaces_confirmacion ni confirmaciones_extra directo (no
-- tiene RLS para ninguna de las tres); esta función security definer es el
-- único camino.
-- =========================================================

create function public.extras_de_la_semana(p_desde date, p_hasta date)
returns table (fecha date, tiempo_comida public.tiempo_comida, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select e.fecha, l.tiempo_comida, sum(c.cantidad_personas)::integer as total
  from public.confirmaciones_extra c
  join public.enlaces_confirmacion l on l.id = c.enlace_id
  join public.eventos e on e.id = l.evento_id
  where (select public.mi_rol()) = 'administracion'
    and e.fecha between p_desde and p_hasta
  group by e.fecha, l.tiempo_comida
$$;

revoke execute on function public.extras_de_la_semana(date, date) from public, anon;
grant execute on function public.extras_de_la_semana(date, date) to authenticated, service_role;
```

- [ ] **Paso 2: escribir las pruebas de integración**

Agregar a `tests/integration/comidas.test.ts` (usa los mismos helpers ya presentes en el archivo:
`admin`, `ids`, `clienteComo`; y necesita eventos + enlaces, así que crea sus propias filas con
`admin` directamente):

```ts
describe('extras_de_la_semana', () => {
  const LUNES = '2026-10-05'
  const MIERCOLES = '2026-10-07'

  async function sembrarExtra(cantidad: number, tiempo_comida: 'desayuno' | 'almuerzo' | 'cena' = 'cena') {
    const { data: evento, error: errorEvento } = await admin
      .from('eventos')
      .insert({ titulo: 'San Rafael', fecha: MIERCOLES, creado_por: ids.director })
      .select('id')
      .single()
    if (errorEvento) throw errorEvento
    const { data: enlace, error: errorEnlace } = await admin
      .from('enlaces_confirmacion')
      .insert({
        evento_id: evento.id,
        tiempo_comida,
        vence_en: new Date(Date.now() + 3_600_000).toISOString(),
        creado_por: ids.director,
      })
      .select('id')
      .single()
    if (errorEnlace) throw errorEnlace
    const { error: errorConfirmacion } = await admin
      .from('confirmaciones_extra')
      .insert({ enlace_id: enlace.id, nombre: 'Familia de prueba', cantidad_personas: cantidad })
    if (errorConfirmacion) throw errorConfirmacion
  }

  it('Administración ve el total, sin nombres', async () => {
    await sembrarExtra(3)
    await sembrarExtra(2, 'cena')
    const cocina = await clienteComo('administracion')
    const { data, error } = await cocina.rpc('extras_de_la_semana', { p_desde: LUNES, p_hasta: '2026-10-11' })
    expect(error).toBeNull()
    expect(data).toEqual([{ fecha: MIERCOLES, tiempo_comida: 'cena', total: 5 }])
    expect(JSON.stringify(data)).not.toMatch(/familia/i)
  })

  it('Director y Residente no obtienen nada (la función es solo para Administración)', async () => {
    await sembrarExtra(1)
    for (const clave of ['director', 'residente'] as const) {
      const cliente = await clienteComo(clave)
      const { data } = await cliente.rpc('extras_de_la_semana', { p_desde: LUNES, p_hasta: '2026-10-11' })
      expect(data).toEqual([])
    }
  })

  it('sin confirmaciones en el rango, lista vacía', async () => {
    const cocina = await clienteComo('administracion')
    const { data } = await cocina.rpc('extras_de_la_semana', { p_desde: '2020-01-01', p_hasta: '2020-01-07' })
    expect(data).toEqual([])
  })
})
```

- [ ] **Paso 3: correr, confirmar que falla, aplicar la migración, confirmar que pasa**

Correr: `npx vitest run --project integracion tests/integration/comidas.test.ts -t extras_de_la_semana`
Esperado: FALLA (función no existe) → aplicar migración → PASA.

- [ ] **Paso 4: commit**

```bash
git add supabase/migrations/20260921201000_extras_administracion.sql tests/integration/comidas.test.ts
git commit -m "feat(comidas): extras_de_la_semana, agregado de cenas extra para Administración"
```

---

### Tarea 2: `lib/comidas/resumen.ts` — `totalQueComen()`

**Archivos:**
- Modificar: `lib/comidas/resumen.ts`
- Test: `tests/unit/comidas/resumen.test.ts`

- [ ] **Paso 1: escribir las pruebas que fallan**

Agregar a `tests/unit/comidas/resumen.test.ts` (reutiliza el helper `v()` ya definido arriba en el
archivo):

```ts
describe('totalQueComen', () => {
  it('cuenta todo salvo "no" y "sin definir"', () => {
    const resumen = resumenComida([v('si'), v('si'), v('no'), null, v('tarde', '13:30')])
    expect(totalQueComen(resumen)).toBe(3)
  })

  it('sin personas, 0', () => {
    expect(totalQueComen(resumenComida([]))).toBe(0)
  })

  it('todos "no", 0', () => {
    expect(totalQueComen(resumenComida([v('no'), v('no')]))).toBe(0)
  })
})
```

Y agregar `totalQueComen` al import de `@/lib/comidas/resumen` en la primera línea del archivo.

- [ ] **Paso 2: correr y confirmar que falla**

Correr: `npx vitest run --project unit tests/unit/comidas/resumen.test.ts`
Esperado: FALLA — `totalQueComen` no existe.

- [ ] **Paso 3: implementar**

En `lib/comidas/resumen.ts`, después de `resumenComida`:

```ts
/** Cuántos de un resumen efectivamente comen: descuenta "no" y "sin definir". */
export function totalQueComen(resumen: ResumenComida): number {
  const no = resumen.partes.find((p) => p.clave === 'no')?.cantidad ?? 0
  const sinDefinir = resumen.partes.find((p) => p.clave === 'sin_definir')?.cantidad ?? 0
  return resumen.total - no - sinDefinir
}
```

- [ ] **Paso 4: correr y confirmar que pasa**

Correr: `npx vitest run --project unit tests/unit/comidas/resumen.test.ts`
Esperado: PASA.

- [ ] **Paso 5: commit**

```bash
git add lib/comidas/resumen.ts tests/unit/comidas/resumen.test.ts
git commit -m "feat(comidas): totalQueComen() para la vista agregada de Administración"
```

---

### Tarea 3: `lib/comidas/vista.ts` — `agregarSemana()` y `resumenPlanSemanal()`

**Archivos:**
- Modificar: `lib/comidas/vista.ts`
- Test: `tests/unit/comidas/vista.test.ts`

- [ ] **Paso 1: escribir las pruebas que fallan**

Agregar a `tests/unit/comidas/vista.test.ts` (ajustar el import del encabezado para incluir
`agregarSemana`, `armarDiaAdministracion`, `resumenPlanSemanal`, `type DiaAgregado` y
`type PersonaConPlan`, todos de `@/lib/comidas/vista`):

```ts
describe('agregarSemana', () => {
  it('deja fecha y resumen; nunca filas', () => {
    const dia = armarDiaAdministracion({
      fecha: '2026-10-07',
      personas: [{ id: 'p1', nombre: 'Residente Secreto' }],
      planes: [],
      selecciones: [{ usuario_id: 'p1', fecha: '2026-10-07', comida: 'almuerzo', estado: 'si', nota: null, origen: 'persona' }],
      cerradas: [],
    })
    const [agregado] = agregarSemana([dia])
    expect(agregado).toEqual({ fecha: '2026-10-07', resumen: dia.resumen })
    expect(JSON.stringify(agregado)).not.toContain('Secreto')
    expect((agregado as unknown as { filas?: unknown }).filas).toBeUndefined()
  })
})

describe('resumenPlanSemanal', () => {
  const personas: PersonaConPlan[] = [
    { id: 'p1', nombre: 'A', plan: { 3: { almuerzo: { estado: 'si', nota: null } } } },
    { id: 'p2', nombre: 'B', plan: { 3: { almuerzo: { estado: 'no', nota: null } } } },
  ]

  it('agrega por día de semana y tiempo de comida, sin nombres', () => {
    const semana = resumenPlanSemanal(personas)
    expect(semana[3].almuerzo.partes).toEqual([
      { clave: 'si', cantidad: 1, texto: '1 sí' },
      { clave: 'no', cantidad: 1, texto: '1 no' },
    ])
    expect(JSON.stringify(semana)).not.toMatch(/"A"|"B"/)
  })

  it('un día sin plan definido cuenta como "sin definir"', () => {
    const semana = resumenPlanSemanal(personas)
    expect(semana[1].almuerzo.partes).toEqual([{ clave: 'sin_definir', cantidad: 2, texto: '2 sin definir' }])
  })

  it('sin personas, cada comida queda vacía', () => {
    const semana = resumenPlanSemanal([])
    expect(semana[1].desayuno).toEqual({ total: 0, partes: [] })
  })
})
```

- [ ] **Paso 2: correr y confirmar que falla**

Correr: `npx vitest run --project unit tests/unit/comidas/vista.test.ts`
Esperado: FALLA — `agregarSemana`/`resumenPlanSemanal` no existen.

- [ ] **Paso 3: implementar**

En `lib/comidas/vista.ts`, agregar el import de `resumenComida` (ya se importa `resumenComida` desde
`./resumen`, revisar si falta) y, al final del archivo:

```ts
/** Lo único que cruza al navegador de Administración: nunca `filas`. */
export type DiaAgregado = { fecha: FechaISO; resumen: Record<TiempoComida, ResumenComida> }

export function agregarSemana(dias: readonly DiaAdministracion[]): DiaAgregado[] {
  return dias.map(({ fecha, resumen }) => ({ fecha, resumen }))
}

/**
 * Plan habitual agregado por día de semana (1=lunes…7=domingo) y tiempo de comida, sin nombres.
 * `origen: 'plan'` es solo para reutilizar resumenComida (que ignora el campo, pero el tipo lo exige).
 */
export function resumenPlanSemanal(personas: readonly PersonaConPlan[]): Record<number, Record<TiempoComida, ResumenComida>> {
  const semana = {} as Record<number, Record<TiempoComida, ResumenComida>>
  for (let dia = 1; dia <= 7; dia++) {
    semana[dia] = {} as Record<TiempoComida, ResumenComida>
    for (const comida of TIEMPOS_COMIDA) {
      const valores: ValorEfectivo[] = personas.map((persona) => {
        const valor = persona.plan[dia]?.[comida]
        return valor ? { ...valor, origen: 'plan' } : null
      })
      semana[dia][comida] = resumenComida(valores)
    }
  }
  return semana
}
```

- [ ] **Paso 4: correr y confirmar que pasa**

Correr: `npx vitest run --project unit tests/unit/comidas/vista.test.ts`
Esperado: PASA.

- [ ] **Paso 5: commit**

```bash
git add lib/comidas/vista.ts tests/unit/comidas/vista.test.ts
git commit -m "feat(comidas): agregarSemana() y resumenPlanSemanal() para la vista de Administración"
```

---

### Tarea 4: consultas — cortar `filas` antes de cruzar al cliente

**Archivos:**
- Modificar: `lib/comidas/consultas.ts`

Sin prueba unitaria propia (composición de piezas ya probadas en las Tareas 1-3); se verifica con los
e2e de la Tarea 6, que confirman que ningún nombre llega al navegador de Administración.

- [ ] **Paso 1: agregar las tres funciones**

En `lib/comidas/consultas.ts`, después de `obtenerDiaParaAdministracion` (agregar a los imports:
`agregarSemana`, `resumenPlanSemanal`, `type DiaAgregado` de `./vista`; `diasDeSemana` de `./semana`;
y agregar `type TiempoComida` al import ya existente de `./tipos`, que hoy solo trae `TIEMPOS_COMIDA`
y `type HorasLimite` — las dos funciones nuevas la usan en su tipo de retorno):

```ts
/** Semana completa para Administración: solo cantidades por día y tiempo de comida, nunca por persona. */
export async function obtenerSemanaParaAdministracion(lunes: FechaISO): Promise<DiaAgregado[]> {
  const domingo = sumarDias(lunes, 6)
  const dias = diasDeSemana(lunes)
  const supabase = await crearClienteServidor()
  const personas = await listarPerfiles({ soloActivos: true, roles: ROLES_CON_COMIDAS })
  const ids = personas.map((persona) => persona.id)

  const [planes, selecciones, cerradas, ausentesPorDia] = await Promise.all([
    supabase.from('plan_semanal').select('usuario_id, dia_semana, comida, estado, nota', { count: 'exact' }).in('usuario_id', ids),
    supabase
      .from('selecciones_comida')
      .select('usuario_id, fecha, comida, estado, nota, origen')
      .in('usuario_id', ids)
      .gte('fecha', lunes)
      .lte('fecha', domingo),
    supabase.from('comidas_cerradas').select('fecha, comida').gte('fecha', lunes).lte('fecha', domingo),
    Promise.all(dias.map((fecha) => supabase.rpc('ausentes_en', { p_fecha: fecha }))),
  ])
  if (planes.error) throw planes.error
  if (selecciones.error) throw selecciones.error
  if (cerradas.error) throw cerradas.error
  for (const resultado of ausentesPorDia) if (resultado.error) throw resultado.error
  // Mismo resguardo que obtenerPlanesDeTodos: si PostgREST corta en max_rows, fallar en vez de agregar de menos.
  if (planes.count !== null && planes.count > planes.data.length) {
    throw new Error(`Planes semanales truncados: llegaron ${planes.data.length} de ${planes.count} filas.`)
  }

  const diasAdministracion = dias.map((fecha, indice) =>
    armarDiaAdministracion({
      fecha,
      personas,
      planes: planes.data,
      selecciones: selecciones.data,
      cerradas: cerradas.data,
      ausentes: ausentesPorDia[indice].data,
    }),
  )
  return agregarSemana(diasAdministracion)
}

/** Cenas/comidas extra confirmadas por el enlace público, por fecha y tiempo de comida. */
export async function obtenerExtrasDeLaSemana(lunes: FechaISO): Promise<Record<string, Partial<Record<TiempoComida, number>>>> {
  const domingo = sumarDias(lunes, 6)
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('extras_de_la_semana', { p_desde: lunes, p_hasta: domingo })
  if (error) throw error

  const extras: Record<string, Partial<Record<TiempoComida, number>>> = {}
  for (const fila of data) {
    const porDia = (extras[fila.fecha] ??= {})
    porDia[fila.tiempo_comida] = fila.total
  }
  return extras
}

/** Plan habitual agregado, para Administración (nunca por persona). */
export async function obtenerResumenPlanSemanal(): Promise<Record<number, Record<TiempoComida, import('./resumen').ResumenComida>>> {
  const personas = await obtenerPlanesDeTodos()
  return resumenPlanSemanal(personas)
}
```

- [ ] **Paso 2: commit**

```bash
git add lib/comidas/consultas.ts
git commit -m "feat(comidas): consultas agregadas para Administración, sin filas por persona"
```

---

### Tarea 5: páginas y componentes — semana y plan

**Archivos:**
- Crear: `app/(app)/comidas/_componentes/semana-agregada-administracion.tsx`
- Crear: `app/(app)/comidas/_componentes/plan-agregado-administracion.tsx`
- Eliminar: `app/(app)/comidas/_componentes/semana-administracion.tsx`
- Eliminar: `app/(app)/comidas/_componentes/plan-administracion.tsx`
- Modificar: `app/(app)/comidas/semana/page.tsx`
- Modificar: `app/(app)/comidas/plan/page.tsx`

- [ ] **Paso 1: `semana-agregada-administracion.tsx`**

```tsx
import { totalQueComen } from '@/lib/comidas/resumen'
import { fechaCorta, nombreDia } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA, type TiempoComida } from '@/lib/comidas/tipos'
import type { DiaAgregado } from '@/lib/comidas/vista'

/** La hoja desde la que se cocina: cuánto preparar cada día, nunca para quién. */
export function SemanaAgregadaAdministracion({
  dias,
  extras,
}: {
  dias: DiaAgregado[]
  extras: Record<string, Partial<Record<TiempoComida, number>>>
}) {
  return (
    <div className="card admin-table-scroll">
      <div className="section-title">Cantidades de la semana</div>
      <table className="admin-week-table">
        <thead>
          <tr>
            <th scope="col">Comida</th>
            {dias.map((dia) => (
              <th key={dia.fecha} scope="col">
                {nombreDia(dia.fecha).slice(0, 3)} {fechaCorta(dia.fecha)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TIEMPOS_COMIDA.map((comida) => (
            <tr key={comida}>
              <th scope="row">{ETIQUETA_TIEMPO[comida]}</th>
              {dias.map((dia) => {
                const extra = extras[dia.fecha]?.[comida]
                return (
                  <td key={dia.fecha} data-et={`${ETIQUETA_TIEMPO[comida]} ${fechaCorta(dia.fecha)}`}>
                    <div className="conteo-numero">{totalQueComen(dia.resumen[comida])}</div>
                    {extra ? <div className="status-note">+{extra} extra</div> : null}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Paso 2: `plan-agregado-administracion.tsx`**

```tsx
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA } from '@/lib/comidas/tipos'
import { totalQueComen, type ResumenComida } from '@/lib/comidas/resumen'
import { NOMBRES_DIA } from '@/lib/comidas/semana'

export function PlanAgregadoAdministracion({ resumenSemana }: { resumenSemana: Record<number, Record<string, ResumenComida>> }) {
  return (
    <>
      <div className="locked-banner">Vista de solo lectura. Cantidades del patrón habitual de la casa.</div>
      <div className="card admin-table-scroll">
        <table className="admin-week-table">
          <thead>
            <tr>
              <th scope="col">Comida</th>
              {NOMBRES_DIA.map((nombre, i) => (
                <th key={nombre} scope="col">
                  {nombre.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIEMPOS_COMIDA.map((comida) => (
              <tr key={comida}>
                <th scope="row">{ETIQUETA_TIEMPO[comida]}</th>
                {NOMBRES_DIA.map((nombre, i) => (
                  <td key={nombre} data-et={nombre}>
                    {totalQueComen(resumenSemana[i + 1][comida])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
```

- [ ] **Paso 3: borrar los componentes viejos**

```bash
git rm "app/(app)/comidas/_componentes/semana-administracion.tsx" "app/(app)/comidas/_componentes/plan-administracion.tsx"
```

- [ ] **Paso 4: `app/(app)/comidas/semana/page.tsx`**

Reemplazar la rama `administracion` (líneas 21-29) por:

```tsx
  if (perfil.rol === 'administracion') {
    const [dias, extras] = await Promise.all([obtenerSemanaParaAdministracion(lunes), obtenerExtrasDeLaSemana(lunes)])
    return (
      <>
        {/* La vieja SemanaAdministracion la traía adentro: sin esto, Administración no ve los cierres
            del job de cada 5 minutos hasta que recargue a mano. */}
        <RefrescarAlVolver />
        <NavegacionSemana lunes={lunes} hoy={hoy} />
        <SemanaAgregadaAdministracion dias={dias} extras={extras} />
      </>
    )
  }
```

`RefrescarAlVolver` ya está importado en este archivo (lo usa la rama de Residente/Director) — no hace
falta agregar el import. Como esta rama ya no usa `?dia=`, cambiar la desestructuración de
`searchParams` de `const { semana, dia } = await searchParams` a `const { semana } = await searchParams`.

Actualizar el resto de los imports: quitar `obtenerDiaParaAdministracion`, `diaPedido` (comprobar que
ningún otro archivo del árbol de comidas la importa antes de borrar su export de
`lib/comidas/semana.ts` — si algo más la usa, dejarla y solo quitar el import de esta página),
`SemanaAdministracion`; agregar `obtenerSemanaParaAdministracion`,
`obtenerExtrasDeLaSemana` de `@/lib/comidas/consultas` y `SemanaAgregadaAdministracion` de
`../_componentes/semana-agregada-administracion`.

- [ ] **Paso 5: `app/(app)/comidas/plan/page.tsx`**

```tsx
  if (perfil.rol === 'administracion') {
    const resumenSemana = await obtenerResumenPlanSemanal()
    return <PlanAgregadoAdministracion resumenSemana={resumenSemana} />
  }
```

Actualizar imports: quitar `obtenerPlanesDeTodos`, `PlanAdministracion`; agregar
`obtenerResumenPlanSemanal` de `@/lib/comidas/consultas`, `PlanAgregadoAdministracion` de
`../_componentes/plan-agregado-administracion`.

- [ ] **Paso 6: verificación manual**

`npm run dev`, entrar como Administración, confirmar que `/comidas/semana` y `/comidas/plan` muestran
la tabla agregada (no hay ninguna columna "Persona").

- [ ] **Paso 7: commit**

```bash
git add "app/(app)/comidas/_componentes/semana-agregada-administracion.tsx" "app/(app)/comidas/_componentes/plan-agregado-administracion.tsx" "app/(app)/comidas/semana/page.tsx" "app/(app)/comidas/plan/page.tsx"
git commit -m "feat(comidas): Administración ve cantidades agregadas de la semana, no por persona"
```

---

### Tarea 6: reescribir los e2e que dependían de la tabla persona-por-persona

**Archivos:**
- Modificar: `tests/e2e/comidas.spec.ts`

- [ ] **Paso 1: `'un residente cambia el almuerzo y Administración lo ve en Semana'` (líneas 121-142)**

Reemplazar el bloque de Administración (desde `// Administración` hasta el cierre del test) por:

```ts
  // Administración: ve el agregado del miércoles, sin filas por persona.
  await page.context().clearCookies()
  await iniciarSesion(page, 'administracion')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)

  const celdaAlmuerzo = page.locator(`td[data-et="Almuerzo ${fechaCorta(miercolesSiguiente)}"]`)
  await expect(celdaAlmuerzo).toBeVisible()
  await expect(celdaAlmuerzo).toContainText('1') // solo el residente que confirmó "tarde" comió ese almuerzo.

  await expect(page.locator('.admin-week-table')).not.toContainText('Persona')
  await expect(page.getByRole('row', { name: /^RP\b/ })).toHaveCount(0)
  await sinNombresAjenos(page, 'administracion')
})
```

- [ ] **Paso 2: `'Administración ve siglas y no nombres en Semana y en Plan semanal'` (líneas 145-157)**

Renombrar y reescribir (ya no hay siglas visibles en absoluto, ni de nadie — es una afirmación más
fuerte que antes):

```ts
test('Administración no ve ninguna sigla ni fila por persona en Semana ni en Plan semanal', async ({ page }) => {
  await planAlmuerzoMiercoles()
  await iniciarSesion(page, 'administracion')

  await page.goto('/comidas/semana')
  await expect(page.getByRole('row', { name: /^RP\b/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: /^DP\b/ })).toHaveCount(0)
  await sinNombresAjenos(page, 'administracion')

  await page.goto('/comidas/plan')
  await expect(page.getByRole('row', { name: /^RP\b/ })).toHaveCount(0)
  await sinNombresAjenos(page, 'administracion')
})
```

- [ ] **Paso 3: `'Administración ve "No comer" de quien está ausente, sin saber que es una ausencia'` (líneas 258-277)**

Reemplazar el bloque de Administración (desde `await iniciarSesion(page, 'administracion')` hasta
antes de `// Las ausencias son privadas...`) por:

```ts
  await iniciarSesion(page, 'administracion')
  await page.goto(`/comidas/semana?semana=${lunesSiguiente}`)
  const celdaAlmuerzo = page.locator(`td[data-et="Almuerzo ${fechaCorta(miercolesSiguiente)}"]`)
  // El residente ausente cuenta como "no" (no suma) y el director no tiene plan ese día ("sin
  // definir", tampoco suma): el total que come queda en 0, sin exponer que fue por una ausencia.
  await expect(celdaAlmuerzo.locator('.conteo-numero')).toHaveText('0')
```

(el resto del test, desde `// Las ausencias son privadas...`, queda igual.)

- [ ] **Paso 4: correr todo el archivo**

Correr: `npx playwright test tests/e2e/comidas.spec.ts`
Esperado: PASA.

- [ ] **Paso 5: commit**

```bash
git add tests/e2e/comidas.spec.ts
git commit -m "test(comidas): e2e de la vista agregada de Administración"
```

---

### Tarea 7: tipos de Supabase y apertura del PR

Mismo procedimiento que los planes hermanos:

```bash
git push -u origin HEAD
gh run download "$(gh run list --branch "$(git branch --show-current)" --workflow CI --limit 1 --json databaseId --jq '.[0].databaseId')" -n database-types -D lib/supabase
git add lib/supabase/database.types.ts
git commit -m "chore(comidas): regenera database.types.ts"
git push
```

Abrir el PR, confirmar CI en verde. **No fusionar sin que el usuario lo revise y mergee.**
