# Comidas — Parte A: esquema — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** PR de esquema de la pista Comidas:
- tablas `plan_semanal`, `selecciones_comida` y `comidas_cerradas` con RLS;
- `nota_valida` (CHECK en ambas tablas) y `comida_editable` (bloquea escrituras según ventana, hora límite y cierre definitivo);
- `guardar_seleccion` y `volver_a_plan` con errores `MOL01` y `MOL04`;
- procedimiento `cerrar_comidas_vencidas` agendado con `pg_cron` cada 5 minutos;
- `comidas_sin_definir` para los recordatorios de la pista 06;
- pruebas de integración que corren **solo en CI**.

**Arquitectura:**
- **Una migración** (`<timestamp>_comidas.sql`) escrita en tres tareas (tablas y RLS; funciones de escritura; cierre, cron y recordatorios).
- **Permisos en la base:** RLS con `(select public.soy_activo())` en todas las políticas; las escrituras de selecciones además exigen `comida_editable(fecha, comida)`.
- **Funciones de escritura `security invoker`:** RLS sigue aplicando; las funciones solo agregan errores con código propio para que la Parte B pueda explicar el rechazo (spec §6.4).
- **Cierre con `COMMIT` por comida:** el procedimiento no es `security definer` ni tiene cláusula `SET`; el job de `pg_cron` ejecuta solo el `CALL` (spec §6.3).
- **Pruebas:** clientes de `tests/soporte/usuarios-prueba.ts` para RLS y RPC; conexión directa con `pg` para el `CALL`, `cron.job` y los casos de paridad con `ahora` explícito.

**Stack:** Postgres 17 (Supabase) con `pg_cron` · `@supabase/supabase-js` 2.116 · Vitest 5 · `pg` 8 + `@types/pg` 8 (solo pruebas) · TypeScript 5.9 · Node 24.

**Referencias:** spec §3 (modelo de datos), §5.2 (RLS), §6.1–6.4 (cierre, valor efectivo, congelado, guardar), §8.3 (tareas programadas), §9.2 (pruebas), §10 (migraciones) · índice [`2026-09-16-00-indice.md`](2026-09-16-00-indice.md) §2 (reglas), §3.4 (base de datos), §4 (contratos con 06) · Fase 0 [`2026-09-16-01-fase-0-base.md`](2026-09-16-01-fase-0-base.md) tareas 4 (`casos-comidas.json`, `lib/comidas`), 6 (enums, `horas_limite`, `mi_rol`, `soy_activo`, `zona_horaria_app`), 15 (`usuarios-prueba`) y 17 (job `base-de-datos`).

**Antes de empezar:**
- La Fase 0 está mergeada en `master`.
- `gh` autenticado (`gh auth status`).
- No hace falta Docker ni `.env.local`: nada de esta parte corre contra el proyecto.

---

## Decisiones de esta parte

- **Contrato fijo.** Nombres y firmas de tablas y funciones son los que consumen la Parte B y la pista 06 (índice §4). No se renombran.
- **Sin códigos de error nuevos:** se usan `MOL01` (comida cerrada o fuera de ventana) y `MOL04` (nota inválida), ya reservados en el índice §3.4. Rol no permitido → `42501`.
- **Orden de verificación en `guardar_seleccion`:** rol → `MOL01` → normaliza nota (`btrim`, vacía = `null`) → `MOL04` → compara con el plan. Así un usuario sin permiso nunca recibe información sobre el estado de una comida.
- **`set search_path = ''`** también en `nota_valida`, `guardar_seleccion` y `volver_a_plan` (aunque no son `security definer`), para que el linter de Supabase no marque `function_search_path_mutable`. La única función sin `SET` es el procedimiento (spec §6.3).
- **`comidas_cerradas` sin escritura para clientes:** además de no tener políticas de escritura, se revoca `insert, update, delete` a `anon` y `authenticated`. El servidor (llave secreta) y el procedimiento siguen escribiendo.
- **`nota` de `enfermo`:** `btrim` no vacío y a lo sumo 200 caracteres. `temprano`/`tarde`: `HH:MM` de 24 h. Resto: `null`.
- **Pruebas independientes del reloj (spec §9.2):**
  - Las escrituras usan el **almuerzo del miércoles de la semana siguiente** (`sumarDias(lunesDe(fechaISOEn(new Date())), 9)`), con horas límite por defecto restauradas antes y después de cada prueba: siempre está abierto.
  - Los rechazos por hora usan **ayer** (con cualquier hora límite ya cerró).
  - El cierre se prueba con `p_ahora` explícito sobre una **semana ficticia de 2030** (miércoles 2030-01-16): el job real de `pg_cron`, que corre en CI con la hora real, nunca toca esas fechas.
  - La **paridad** con `tests/fixtures/casos-comidas.json` corre por `pg` dentro de una transacción `REPEATABLE READ` que fija horas límite y `comidas_cerradas` del caso y termina en `ROLLBACK`. Si el job real cerró en CI alguna fecha del fixture (septiembre de 2026), el caso no la ve y no deja estado.
  - Los casos `cierres` del fixture se verifican en el límite exacto: un milisegundo antes del instante de cierre la comida está abierta; en el instante, cerrada.
- **`CALL` por protocolo simple:** la prueba arma `call public.cerrar_comidas_vencidas('<instante>'::timestamptz)` con un literal validado por expresión regular (sin parámetros de consulta) y sin `BEGIN`: el `COMMIT` dentro del procedimiento solo está permitido si el `CALL` es su propia transacción.
- **Job idempotente:** la migración borra el job `cerrar-comidas-vencidas` si existe y lo vuelve a crear.

---

## Mapa de archivos

```
Parte A — PR de esquema (rama feat/comidas-esquema)
package.json, package-lock.json                  + pg, @types/pg (devDependencies), si faltan
supabase/migrations/<timestamp>_comidas.sql      tablas, nota_valida, comida_editable, RLS,
                                                 guardar_seleccion, volver_a_plan,
                                                 cerrar_comidas_vencidas + pg_cron, comidas_sin_definir
tests/integration/comidas.test.ts                RLS, CHECK, paridad, funciones, cierre (solo CI)
```

---

### Tarea 1: Rama y cliente `pg` para las pruebas

**Archivos:**
- Modificar (si falta `pg`): `package.json`, `package-lock.json`

- [ ] **Paso 1: Crear la rama desde `master` actualizado**

```bash
git switch master && git pull && git switch -c feat/comidas-esquema
```

Esperado: `Switched to a new branch 'feat/comidas-esquema'`.

- [ ] **Paso 2: Ver si otra pista ya instaló `pg`**

```bash
npm ls pg @types/pg
```

Esperado, uno de dos:
- aparecen `pg@8.x` y `@types/pg@8.x` → saltar los pasos 3 y 4;
- sale `(empty)` (código de salida 1) → seguir con el paso 3.

- [ ] **Paso 3: Instalar `pg` como dependencia de desarrollo**

Las pruebas necesitan conexión directa a Postgres: `CALL` de un procedimiento con `COMMIT`, lectura de `cron.job` y transacciones con `ROLLBACK` no se pueden hacer por la API.

```bash
npm install -D pg@^8.16.0 @types/pg@^8.15.0
```

Esperado: `package.json` tiene `"pg"` y `"@types/pg"` en `devDependencies`; `npm ls pg @types/pg` ya no dice `(empty)`.

- [ ] **Paso 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: pg para pruebas de integración con conexión directa"
```

---
### Tarea 2: Pruebas de integración (primero la prueba)

**Archivos:**
- Crear: `tests/integration/comidas.test.ts`

> No corren en local (sin Docker). Se escriben ahora, se verifica que compilen y se ejecutan en el job `base-de-datos` de CI (Tarea 6). El archivo se arma en cinco pasos: cada uno **agrega al final** del anterior.

- [ ] **Paso 1: Encabezado, constantes y utilidades**

Los clientes de `usuarios-prueba` no tienen tipo `Database`, así que las tablas nuevas se usan sin regenerar tipos. `SUPABASE_DB_URL` la exporta `scripts/ci/entorno-supabase-local.mjs` (Fase 0).

`tests/integration/comidas.test.ts`:

```ts
import { Client } from 'pg'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { HORAS_LIMITE_POR_DEFECTO, type HorasLimite } from '@/lib/comidas/tipos'
import { fechaISOEn, lunesDe, sumarDias } from '@/lib/fechas'
import casos from '@/tests/fixtures/casos-comidas.json'
import { exigirBaseLocal } from '../soporte/entorno-local'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

const admin = clienteAdminPrueba()
let ids: Record<ClaveUsuario, string>

const HOY = fechaISOEn(new Date())
/** Miércoles de la semana siguiente: con las horas límite por defecto siempre está abierto (spec §9.2). */
const FECHA_ABIERTA = sumarDias(lunesDe(HOY), 9)
const DIA_ABIERTA = 3
/** Con cualquier hora límite (día anterior o mismo día, hasta 23:59) ya cerró. */
const AYER = sumarDias(HOY, -1)
/** Lunes de dentro de dos semanas: fuera de la ventana editable. */
const FUERA_DE_VENTANA = sumarDias(lunesDe(HOY), 14)
/** Miércoles de una semana ficticia: el job real de pg_cron nunca la cierra. */
const MIERCOLES_2030 = '2030-01-16'

type Valor = { estado: string; nota: string | null }
const SI: Valor = { estado: 'si', nota: null }
const NO: Valor = { estado: 'no', nota: null }
const BOLSA: Valor = { estado: 'bolsa', nota: null }

type Fila = { usuario_id: string; estado: string; nota: string | null; origen: string }
const porUsuario = (filas: Fila[]) => [...filas].sort((a, b) => (a.usuario_id < b.usuario_id ? -1 : 1))

async function restaurarHorasLimite() {
  for (const [comida, h] of Object.entries(HORAS_LIMITE_POR_DEFECTO)) {
    const { error } = await admin
      .from('horas_limite')
      .update({ dia_relativo: h.diaRelativo, hora: h.hora })
      .eq('comida', comida)
    if (error) throw error
  }
}

async function limpiarComidas() {
  const usuarios = Object.values(ids)
  for (const tabla of ['selecciones_comida', 'plan_semanal']) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', usuarios)
    if (error) throw error
  }
  const futuras = await admin.from('comidas_cerradas').delete().gte('fecha', '2030-01-01')
  if (futuras.error) throw futuras.error
  const abierta = await admin.from('comidas_cerradas').delete().eq('fecha', FECHA_ABIERTA)
  if (abierta.error) throw abierta.error
}

async function ponerPlan(clave: ClaveUsuario, dia: number, comida: string, valor: Valor) {
  const { error } = await admin
    .from('plan_semanal')
    .insert({ usuario_id: ids[clave], dia_semana: dia, comida, ...valor })
  if (error) throw error
}

async function ponerSeleccion(clave: ClaveUsuario, fecha: string, comida: string, valor: Valor, origen = 'persona') {
  const { error } = await admin
    .from('selecciones_comida')
    .insert({ usuario_id: ids[clave], fecha, comida, origen, ...valor })
  if (error) throw error
}

async function cerrarConLlaveSecreta(fecha: string, comida: string) {
  const { error } = await admin.from('comidas_cerradas').insert({ fecha, comida })
  if (error) throw error
}

async function desactivar(clave: ClaveUsuario) {
  const { error } = await admin.from('perfiles').update({ activo: false }).eq('id', ids[clave])
  if (error) throw error
}

/** Selecciones de los usuarios de prueba para una comida, ordenadas por usuario. */
async function leerSelecciones(fecha: string, comida: string): Promise<Fila[]> {
  const { data, error } = await admin
    .from('selecciones_comida')
    .select('usuario_id, estado, nota, origen')
    .eq('fecha', fecha)
    .eq('comida', comida)
    .in('usuario_id', Object.values(ids))
  if (error) throw error
  return porUsuario(data as Fila[])
}

async function estaCerrada(fecha: string, comida: string): Promise<boolean> {
  const { data, error } = await admin.from('comidas_cerradas').select('fecha').eq('fecha', fecha).eq('comida', comida)
  if (error) throw error
  return data.length === 1
}

/** Conexión directa a la base temporal de CI. */
async function conPostgres<T>(fn: (cliente: Client) => Promise<T>): Promise<T> {
  exigirBaseLocal()
  const url = process.env.SUPABASE_DB_URL ?? ''
  if (!/@(127\.0\.0\.1|localhost):\d+\//.test(url)) {
    throw new Error('SUPABASE_DB_URL debe apuntar a la base temporal de CI (127.0.0.1 o localhost).')
  }
  const cliente = new Client({ connectionString: url })
  await cliente.connect()
  try {
    return await fn(cliente)
  } finally {
    await cliente.end()
  }
}

/** CALL fuera de transacción y por protocolo simple: el procedimiento hace COMMIT (spec §6.3). */
async function llamarCierre(ahora: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(ahora)) {
    throw new Error(`Instante inválido: ${ahora}`)
  }
  await conPostgres((c) => c.query(`call public.cerrar_comidas_vencidas('${ahora}'::timestamptz)`))
}

/**
 * comida_editable con horas límite y cierre del caso, en una transacción REPEATABLE READ que termina
 * en ROLLBACK: el caso no ve lo que el job real de pg_cron cierre mientras tanto y no deja estado.
 */
async function editableEnPostgres(p: {
  fecha: string
  comida: string
  ahora: string
  horas: HorasLimite
  cerrada: boolean
}): Promise<boolean> {
  return conPostgres(async (c) => {
    await c.query('begin isolation level repeatable read')
    try {
      await c.query('delete from public.comidas_cerradas where fecha = $1 and comida = $2', [p.fecha, p.comida])
      if (p.cerrada) {
        await c.query('insert into public.comidas_cerradas (fecha, comida) values ($1, $2)', [p.fecha, p.comida])
      }
      for (const [comida, h] of Object.entries(p.horas)) {
        await c.query('update public.horas_limite set dia_relativo = $1, hora = $2 where comida = $3', [
          h.diaRelativo,
          h.hora,
          comida,
        ])
      }
      const { rows } = await c.query<{ editable: boolean }>(
        'select public.comida_editable($1::date, $2::public.tiempo_comida, $3::timestamptz) as editable',
        [p.fecha, p.comida, p.ahora],
      )
      return rows[0].editable
    } finally {
      await c.query('rollback')
    }
  })
}

beforeAll(async () => {
  ids = await asegurarUsuariosPrueba()
})

beforeEach(async () => {
  await restaurarHorasLimite()
  await limpiarComidas()
})

afterEach(async () => {
  await limpiarComidas()
  await restaurarHorasLimite()
  await asegurarUsuariosPrueba()
})
```

- [ ] **Paso 2: Agregar las pruebas de RLS y de la nota**

Agregar al final de `tests/integration/comidas.test.ts`:

```ts
describe('plan_semanal: RLS', () => {
  it.each(['director', 'residente'] as const)('%s crea, edita y borra su propio plan', async (clave) => {
    const cliente = await clienteComo(clave)
    const fila = { usuario_id: ids[clave], dia_semana: 1, comida: 'cena', ...SI }
    expect((await cliente.from('plan_semanal').insert(fila)).error).toBeNull()

    const edicion = await cliente
      .from('plan_semanal')
      .update({ estado: 'tarde', nota: '19:30' })
      .eq('usuario_id', ids[clave])
      .eq('dia_semana', 1)
      .eq('comida', 'cena')
    expect(edicion.error).toBeNull()
    const { data } = await cliente.from('plan_semanal').select('estado, nota').eq('usuario_id', ids[clave])
    expect(data).toEqual([{ estado: 'tarde', nota: '19:30' }])

    expect((await cliente.from('plan_semanal').delete().eq('usuario_id', ids[clave])).error).toBeNull()
    const { data: despues } = await admin.from('plan_semanal').select('comida').eq('usuario_id', ids[clave])
    expect(despues).toEqual([])
  })

  it('un residente solo ve su propio plan', async () => {
    await ponerPlan('residente', 1, 'almuerzo', SI)
    await ponerPlan('residente2', 1, 'almuerzo', NO)
    const residente = await clienteComo('residente')
    const { data, error } = await residente.from('plan_semanal').select('usuario_id')
    expect(error).toBeNull()
    expect(data).toEqual([{ usuario_id: ids.residente }])
  })

  it('un residente no puede escribir el plan de otra persona', async () => {
    await ponerPlan('residente2', 1, 'almuerzo', SI)
    const residente = await clienteComo('residente')
    const { error } = await residente
      .from('plan_semanal')
      .insert({ usuario_id: ids.residente2, dia_semana: 2, comida: 'almuerzo', ...SI })
    expect(error?.code).toBe('42501')
    await residente.from('plan_semanal').update({ estado: 'no' }).eq('usuario_id', ids.residente2)
    await residente.from('plan_semanal').delete().eq('usuario_id', ids.residente2)
    const { data } = await admin.from('plan_semanal').select('dia_semana, estado').eq('usuario_id', ids.residente2)
    expect(data).toEqual([{ dia_semana: 1, estado: 'si' }])
  })

  it('Administración ve todos los planes y no puede escribir', async () => {
    await ponerPlan('residente', 1, 'almuerzo', SI)
    await ponerPlan('director', 1, 'almuerzo', NO)
    const administracion = await clienteComo('administracion')
    const { data } = await administracion
      .from('plan_semanal')
      .select('usuario_id')
      .in('usuario_id', [ids.residente, ids.director])
    expect(data).toHaveLength(2)

    const { error } = await administracion
      .from('plan_semanal')
      .insert({ usuario_id: ids.administracion, dia_semana: 1, comida: 'cena', ...SI })
    expect(error?.code).toBe('42501')
    await administracion.from('plan_semanal').update({ estado: 'bolsa' }).eq('usuario_id', ids.residente)
    const { data: plan } = await admin.from('plan_semanal').select('estado').eq('usuario_id', ids.residente).single()
    expect(plan!.estado).toBe('si')
  })

  it('un usuario inactivo no ve ni escribe su plan', async () => {
    await ponerPlan('residente2', 1, 'almuerzo', SI)
    await desactivar('residente2')
    const inactivo = await clienteComo('residente2')
    const { data } = await inactivo.from('plan_semanal').select('usuario_id')
    expect(data).toEqual([])
    const { error } = await inactivo
      .from('plan_semanal')
      .insert({ usuario_id: ids.residente2, dia_semana: 2, comida: 'cena', ...SI })
    expect(error?.code).toBe('42501')
  })
})

describe('selecciones_comida: RLS', () => {
  const fila = (clave: ClaveUsuario, fecha: string, valor: Valor = NO) => ({
    usuario_id: ids[clave],
    fecha,
    comida: 'almuerzo',
    origen: 'persona',
    ...valor,
  })

  it('un residente escribe su selección en una comida abierta', async () => {
    const residente = await clienteComo('residente')
    expect((await residente.from('selecciones_comida').insert(fila('residente', FECHA_ABIERTA))).error).toBeNull()
    expect(await leerSelecciones(FECHA_ABIERTA, 'almuerzo')).toEqual([
      { usuario_id: ids.residente, estado: 'no', nota: null, origen: 'persona' },
    ])
  })

  it('rechaza insertar en una comida vencida o fuera de la ventana', async () => {
    const residente = await clienteComo('residente')
    for (const fecha of [AYER, FUERA_DE_VENTANA]) {
      const { error } = await residente.from('selecciones_comida').insert(fila('residente', fecha))
      expect(error?.code).toBe('42501')
    }
  })

  it('no permite cambiar ni borrar la selección de una comida vencida', async () => {
    await ponerSeleccion('residente', AYER, 'almuerzo', NO)
    const residente = await clienteComo('residente')
    await residente.from('selecciones_comida').update({ estado: 'si' }).eq('usuario_id', ids.residente).eq('fecha', AYER)
    await residente.from('selecciones_comida').delete().eq('usuario_id', ids.residente).eq('fecha', AYER)
    expect(await leerSelecciones(AYER, 'almuerzo')).toEqual([
      { usuario_id: ids.residente, estado: 'no', nota: null, origen: 'persona' },
    ])
  })

  it('un residente no ve ni escribe selecciones ajenas', async () => {
    await ponerSeleccion('residente2', FECHA_ABIERTA, 'almuerzo', NO)
    const residente = await clienteComo('residente')
    const { data } = await residente.from('selecciones_comida').select('usuario_id').eq('fecha', FECHA_ABIERTA)
    expect(data).toEqual([])
    const { error } = await residente.from('selecciones_comida').insert({ ...fila('residente2', FECHA_ABIERTA), comida: 'cena' })
    expect(error?.code).toBe('42501')
  })

  it('Administración ve todas las selecciones y no puede escribir', async () => {
    await ponerSeleccion('residente', FECHA_ABIERTA, 'almuerzo', NO)
    await ponerSeleccion('director', FECHA_ABIERTA, 'almuerzo', SI)
    const administracion = await clienteComo('administracion')
    const { data } = await administracion
      .from('selecciones_comida')
      .select('usuario_id')
      .eq('fecha', FECHA_ABIERTA)
      .in('usuario_id', [ids.residente, ids.director])
    expect(data).toHaveLength(2)
    const { error } = await administracion.from('selecciones_comida').insert(fila('administracion', FECHA_ABIERTA))
    expect(error?.code).toBe('42501')
  })

  it('un usuario inactivo no ve selecciones', async () => {
    await ponerSeleccion('residente2', FECHA_ABIERTA, 'almuerzo', NO)
    await desactivar('residente2')
    const inactivo = await clienteComo('residente2')
    const { data } = await inactivo.from('selecciones_comida').select('usuario_id')
    expect(data).toEqual([])
  })
})

describe('comidas_cerradas: RLS', () => {
  it('los usuarios activos la leen y nadie la escribe con su sesión', async () => {
    await cerrarConLlaveSecreta(FECHA_ABIERTA, 'cena')
    for (const clave of ['director', 'residente', 'administracion'] as const) {
      const cliente = await clienteComo(clave)
      const { data } = await cliente.from('comidas_cerradas').select('comida').eq('fecha', FECHA_ABIERTA)
      expect(data).toEqual([{ comida: 'cena' }])
      const { error } = await cliente.from('comidas_cerradas').insert({ fecha: FECHA_ABIERTA, comida: 'almuerzo' })
      expect(error?.code).toBe('42501')
      await cliente.from('comidas_cerradas').delete().eq('fecha', FECHA_ABIERTA)
    }
    expect(await estaCerrada(FECHA_ABIERTA, 'cena')).toBe(true)
    expect(await estaCerrada(FECHA_ABIERTA, 'almuerzo')).toBe(false)
  })

  it('un usuario inactivo no la lee', async () => {
    await cerrarConLlaveSecreta(FECHA_ABIERTA, 'cena')
    await desactivar('residente2')
    const inactivo = await clienteComo('residente2')
    const { data } = await inactivo.from('comidas_cerradas').select('comida').eq('fecha', FECHA_ABIERTA)
    expect(data).toEqual([])
  })
})

describe('nota según el estado (CHECK nota_valida)', () => {
  const invalidas = [
    { caso: 'temprano sin nota', estado: 'temprano', nota: null },
    { caso: 'tarde con hora de un dígito', estado: 'tarde', nota: '7:30' },
    { caso: 'tarde a las 24:00', estado: 'tarde', nota: '24:00' },
    { caso: 'temprano con minuto 60', estado: 'temprano', nota: '12:60' },
    { caso: 'enfermo con nota en blanco', estado: 'enfermo', nota: '   ' },
    { caso: 'enfermo con 201 caracteres', estado: 'enfermo', nota: 'x'.repeat(201) },
    { caso: 'sí con nota', estado: 'si', nota: 'algo' },
    { caso: 'en bolsa con nota vacía', estado: 'bolsa', nota: '' },
  ]

  it.each(invalidas)('rechaza $caso (23514)', async ({ estado, nota }) => {
    const plan = await admin
      .from('plan_semanal')
      .insert({ usuario_id: ids.residente, dia_semana: 1, comida: 'almuerzo', estado, nota })
    expect(plan.error?.code).toBe('23514')
    const seleccion = await admin
      .from('selecciones_comida')
      .insert({ usuario_id: ids.residente, fecha: FECHA_ABIERTA, comida: 'almuerzo', origen: 'persona', estado, nota })
    expect(seleccion.error?.code).toBe('23514')
  })

  const validas = [
    { caso: 'tarde a las 23:59', estado: 'tarde', nota: '23:59' },
    { caso: 'temprano a las 06:30', estado: 'temprano', nota: '06:30' },
    { caso: 'enfermo con texto', estado: 'enfermo', nota: 'Solo sopa' },
    { caso: 'enfermo con 200 caracteres', estado: 'enfermo', nota: 'x'.repeat(200) },
    { caso: 'no sin nota', estado: 'no', nota: null },
  ]

  it.each(validas)('acepta $caso', async ({ estado, nota }) => {
    const plan = await admin
      .from('plan_semanal')
      .insert({ usuario_id: ids.residente, dia_semana: 1, comida: 'almuerzo', estado, nota })
    expect(plan.error).toBeNull()
    const seleccion = await admin
      .from('selecciones_comida')
      .insert({ usuario_id: ids.residente, fecha: FECHA_ABIERTA, comida: 'almuerzo', origen: 'persona', estado, nota })
    expect(seleccion.error).toBeNull()
  })
})
```

- [ ] **Paso 3: Agregar la paridad de `comida_editable` con el fixture**

Mismos casos que `tests/unit/comidas/reglas.test.ts` (Fase 0, tarea 4). Agregar al final:

```ts
describe('comida_editable: paridad con lib/comidas (tests/fixtures/casos-comidas.json)', () => {
  it.each(casos.abiertas)('$nombre', async (caso) => {
    const editable = await editableEnPostgres({
      fecha: caso.fecha,
      comida: caso.comida,
      ahora: caso.ahora,
      horas: (caso.horas as HorasLimite | null) ?? HORAS_LIMITE_POR_DEFECTO,
      cerrada: caso.cerrada,
    })
    expect(editable).toBe(caso.abierta)
  })

  it.each(casos.cierres)('$comida del $fecha cierra exactamente en $cierre', async ({ fecha, comida, cierre }) => {
    const base = { fecha, comida, horas: HORAS_LIMITE_POR_DEFECTO, cerrada: false }
    const unMilisegundoAntes = new Date(Date.parse(cierre) - 1).toISOString()
    expect(await editableEnPostgres({ ...base, ahora: unMilisegundoAntes })).toBe(true)
    expect(await editableEnPostgres({ ...base, ahora: cierre })).toBe(false)
  })

  it('un residente la llama por RPC y por defecto usa la hora real', async () => {
    const residente = await clienteComo('residente')
    const abierta = await residente.rpc('comida_editable', { p_fecha: FECHA_ABIERTA, p_comida: 'almuerzo' })
    expect(abierta).toMatchObject({ error: null, data: true })
    const vencida = await residente.rpc('comida_editable', { p_fecha: AYER, p_comida: 'almuerzo' })
    expect(vencida).toMatchObject({ error: null, data: false })
  })
})
```

- [ ] **Paso 4: Agregar las pruebas de `guardar_seleccion` y `volver_a_plan`**

Agregar al final:

```ts
async function guardar(clave: ClaveUsuario, fecha: string, comida: string, estado: string, nota: string | null) {
  const cliente = await clienteComo(clave)
  return cliente.rpc('guardar_seleccion', { p_fecha: fecha, p_comida: comida, p_estado: estado, p_nota: nota })
}

async function volver(clave: ClaveUsuario, fecha: string, comida: string) {
  const cliente = await clienteComo(clave)
  return cliente.rpc('volver_a_plan', { p_fecha: fecha, p_comida: comida })
}

describe('guardar_seleccion', () => {
  it('guarda una excepción con origen "persona" y la nota recortada', async () => {
    await ponerPlan('residente', DIA_ABIERTA, 'almuerzo', SI)
    const { error } = await guardar('residente', FECHA_ABIERTA, 'almuerzo', 'tarde', ' 13:30 ')
    expect(error).toBeNull()
    expect(await leerSelecciones(FECHA_ABIERTA, 'almuerzo')).toEqual([
      { usuario_id: ids.residente, estado: 'tarde', nota: '13:30', origen: 'persona' },
    ])
  })

  it('actualiza la excepción existente', async () => {
    await ponerPlan('residente', DIA_ABIERTA, 'almuerzo', SI)
    await guardar('residente', FECHA_ABIERTA, 'almuerzo', 'tarde', '13:30')
    const { error } = await guardar('residente', FECHA_ABIERTA, 'almuerzo', 'bolsa', null)
    expect(error).toBeNull()
    expect(await leerSelecciones(FECHA_ABIERTA, 'almuerzo')).toEqual([
      { usuario_id: ids.residente, estado: 'bolsa', nota: null, origen: 'persona' },
    ])
  })

  it('si el valor es igual al plan, borra la excepción', async () => {
    await ponerPlan('residente', DIA_ABIERTA, 'almuerzo', { estado: 'temprano', nota: '11:30' })
    await guardar('residente', FECHA_ABIERTA, 'almuerzo', 'no', null)
    const { error } = await guardar('residente', FECHA_ABIERTA, 'almuerzo', 'temprano', '11:30 ')
    expect(error).toBeNull()
    expect(await leerSelecciones(FECHA_ABIERTA, 'almuerzo')).toEqual([])
  })

  it('una nota vacía cuenta como sin nota', async () => {
    await ponerPlan('residente', DIA_ABIERTA, 'almuerzo', SI)
    const { error } = await guardar('residente', FECHA_ABIERTA, 'almuerzo', 'si', '')
    expect(error).toBeNull()
    expect(await leerSelecciones(FECHA_ABIERTA, 'almuerzo')).toEqual([])
  })

  it('sin plan, guarda la selección aunque sea "Sí"', async () => {
    const { error } = await guardar('director', FECHA_ABIERTA, 'almuerzo', 'si', null)
    expect(error).toBeNull()
    expect(await leerSelecciones(FECHA_ABIERTA, 'almuerzo')).toEqual([
      { usuario_id: ids.director, estado: 'si', nota: null, origen: 'persona' },
    ])
  })

  it.each([
    ['tarde', '1:30'],
    ['enfermo', '   '],
    ['si', 'con nota'],
  ])('rechaza %s con nota "%s" (MOL04)', async (estado, nota) => {
    const { error } = await guardar('residente', FECHA_ABIERTA, 'almuerzo', estado, nota)
    expect(error?.code).toBe('MOL04')
    expect(await leerSelecciones(FECHA_ABIERTA, 'almuerzo')).toEqual([])
  })

  it('rechaza con MOL01 una comida vencida o fuera de la ventana', async () => {
    // La hora límite más tardía posible: ayer igual ya cerró.
    const { error: errorHoras } = await admin
      .from('horas_limite')
      .update({ dia_relativo: 0, hora: '23:59' })
      .eq('comida', 'almuerzo')
    expect(errorHoras).toBeNull()
    for (const fecha of [AYER, FUERA_DE_VENTANA]) {
      const { error } = await guardar('residente', fecha, 'almuerzo', 'no', null)
      expect(error?.code).toBe('MOL01')
    }
  })

  it('rechaza con MOL01 una comida cerrada aunque falte para la hora límite', async () => {
    await cerrarConLlaveSecreta(FECHA_ABIERTA, 'almuerzo')
    const { error } = await guardar('residente', FECHA_ABIERTA, 'almuerzo', 'no', null)
    expect(error?.code).toBe('MOL01')
    expect(await leerSelecciones(FECHA_ABIERTA, 'almuerzo')).toEqual([])
  })

  it('Administración no puede guardar (42501)', async () => {
    const { error } = await guardar('administracion', FECHA_ABIERTA, 'almuerzo', 'si', null)
    expect(error?.code).toBe('42501')
  })

  it('un usuario inactivo no puede guardar (42501)', async () => {
    await desactivar('residente2')
    const { error } = await guardar('residente2', FECHA_ABIERTA, 'almuerzo', 'si', null)
    expect(error?.code).toBe('42501')
  })
})

describe('volver_a_plan', () => {
  it('borra solo la excepción propia', async () => {
    await ponerPlan('residente', DIA_ABIERTA, 'almuerzo', SI)
    await ponerSeleccion('residente', FECHA_ABIERTA, 'almuerzo', NO)
    await ponerSeleccion('residente2', FECHA_ABIERTA, 'almuerzo', BOLSA)
    const { error } = await volver('residente', FECHA_ABIERTA, 'almuerzo')
    expect(error).toBeNull()
    expect(await leerSelecciones(FECHA_ABIERTA, 'almuerzo')).toEqual([
      { usuario_id: ids.residente2, estado: 'bolsa', nota: null, origen: 'persona' },
    ])
  })

  it('no borra filas con origen "plan"', async () => {
    await ponerSeleccion('residente', FECHA_ABIERTA, 'almuerzo', SI, 'plan')
    const { error } = await volver('residente', FECHA_ABIERTA, 'almuerzo')
    expect(error).toBeNull()
    expect(await leerSelecciones(FECHA_ABIERTA, 'almuerzo')).toEqual([
      { usuario_id: ids.residente, estado: 'si', nota: null, origen: 'plan' },
    ])
  })

  it('rechaza con MOL01 una comida vencida', async () => {
    await ponerSeleccion('residente', AYER, 'almuerzo', NO)
    const { error } = await volver('residente', AYER, 'almuerzo')
    expect(error?.code).toBe('MOL01')
    expect(await leerSelecciones(AYER, 'almuerzo')).toHaveLength(1)
  })

  it('Administración no puede usarla (42501)', async () => {
    const { error } = await volver('administracion', FECHA_ABIERTA, 'almuerzo')
    expect(error?.code).toBe('42501')
  })
})
```

- [ ] **Paso 5: Agregar las pruebas del cierre y de `comidas_sin_definir`**

Con `p_ahora = 2030-01-16 12:00` (miércoles) el rango del procedimiento va del 2030-01-09 (hoy − 7) al 2030-01-27 (domingo de la semana siguiente). A esa hora ya vencieron el desayuno (cierra el 15 a las 21:00) y el almuerzo (10:00) del 16; la cena (16:00) no.

Agregar al final:

```ts
describe('cerrar_comidas_vencidas', () => {
  const MEDIODIA_2030 = '2030-01-16T12:00:00-06:00'
  const TARDE_2030 = '2030-01-16T17:00:00-06:00'

  it('pg_cron la llama cada 5 minutos; no es security definer ni tiene SET', async () => {
    const job = await conPostgres((c) =>
      c.query("select schedule, command, active from cron.job where jobname = 'cerrar-comidas-vencidas'"),
    )
    expect(job.rows).toEqual([
      { schedule: '*/5 * * * *', command: 'CALL public.cerrar_comidas_vencidas()', active: true },
    ])
    const proc = await conPostgres((c) =>
      c.query(
        "select prokind, prosecdef, proconfig from pg_proc where proname = 'cerrar_comidas_vencidas' and pronamespace = 'public'::regnamespace",
      ),
    )
    expect(proc.rows).toEqual([{ prokind: 'p', prosecdef: false, proconfig: null }])
  })

  it('congela el plan con origen "plan" sin pisar excepciones y marca la comida cerrada', async () => {
    await ponerPlan('residente', DIA_ABIERTA, 'almuerzo', { estado: 'tarde', nota: '13:00' })
    await ponerPlan('director', DIA_ABIERTA, 'almuerzo', NO)
    await ponerSeleccion('director', MIERCOLES_2030, 'almuerzo', BOLSA)
    // No se congelan: cuenta inactiva y rol sin comidas.
    await ponerPlan('residente2', DIA_ABIERTA, 'almuerzo', SI)
    await desactivar('residente2')
    await ponerPlan('administracion', DIA_ABIERTA, 'almuerzo', SI)

    await llamarCierre(MEDIODIA_2030)

    expect(await leerSelecciones(MIERCOLES_2030, 'almuerzo')).toEqual(
      porUsuario([
        { usuario_id: ids.director, estado: 'bolsa', nota: null, origen: 'persona' },
        { usuario_id: ids.residente, estado: 'tarde', nota: '13:00', origen: 'plan' },
      ]),
    )
    expect(await estaCerrada(MIERCOLES_2030, 'almuerzo')).toBe(true)
    // La cena todavía no venció: ni cerrada ni congelada.
    expect(await estaCerrada(MIERCOLES_2030, 'cena')).toBe(false)
  })

  it('solo cierra comidas vencidas desde 7 días antes', async () => {
    await llamarCierre(MEDIODIA_2030)
    expect(await estaCerrada('2030-01-16', 'desayuno')).toBe(true)
    expect(await estaCerrada('2030-01-09', 'cena')).toBe(true)
    expect(await estaCerrada('2030-01-08', 'cena')).toBe(false)
    expect(await estaCerrada('2030-01-17', 'desayuno')).toBe(false)
  })

  it('una comida cerrada sin plan queda sin fila', async () => {
    await ponerPlan('residente', DIA_ABIERTA, 'almuerzo', SI)
    await llamarCierre(MEDIODIA_2030)
    expect(await estaCerrada(MIERCOLES_2030, 'desayuno')).toBe(true)
    expect(await leerSelecciones(MIERCOLES_2030, 'desayuno')).toEqual([])
  })

  it('es idempotente y el cierre es definitivo', async () => {
    const editableALas8 = async () => {
      const { rows } = await conPostgres((c) =>
        c.query<{ editable: boolean }>(
          "select public.comida_editable('2030-01-16', 'cena', '2030-01-16T08:00:00-06:00') as editable",
        ),
      )
      return rows[0].editable
    }
    await ponerPlan('residente', DIA_ABIERTA, 'cena', SI)
    expect(await editableALas8()).toBe(true)

    await llamarCierre(TARDE_2030)
    await llamarCierre(TARDE_2030)

    expect(await leerSelecciones(MIERCOLES_2030, 'cena')).toEqual([
      { usuario_id: ids.residente, estado: 'si', nota: null, origen: 'plan' },
    ])
    // Aunque se consulte con una hora anterior al cierre, ya no se reabre (spec §6.1).
    expect(await editableALas8()).toBe(false)
  })
})

describe('comidas_sin_definir', () => {
  async function sinDefinir(fecha: string, comida: string): Promise<string[]> {
    const { data, error } = await admin.rpc('comidas_sin_definir', { p_fecha: fecha, p_comida: comida })
    expect(error).toBeNull()
    const deLaPrueba = new Set(Object.values(ids))
    return (data as string[]).filter((id) => deLaPrueba.has(id)).sort()
  }

  it('con la llave secreta devuelve Directores y Residentes activos sin selección ni plan', async () => {
    await ponerPlan('director', DIA_ABIERTA, 'almuerzo', SI)
    await ponerSeleccion('residente', FECHA_ABIERTA, 'almuerzo', NO)
    await desactivar('director2')
    expect(await sinDefinir(FECHA_ABIERTA, 'almuerzo')).toEqual([ids.residente2])
  })

  it('en una comida cerrada el plan ya no cuenta', async () => {
    await ponerPlan('director', DIA_ABIERTA, 'almuerzo', SI)
    await ponerSeleccion('residente', MIERCOLES_2030, 'almuerzo', NO)
    await cerrarConLlaveSecreta(MIERCOLES_2030, 'almuerzo')
    expect(await sinDefinir(MIERCOLES_2030, 'almuerzo')).toEqual(
      [ids.director, ids.director2, ids.residente2].sort(),
    )
  })

  it('con la sesión de un usuario da error de permiso', async () => {
    for (const clave of ['director', 'residente'] as const) {
      const cliente = await clienteComo(clave)
      const { error } = await cliente.rpc('comidas_sin_definir', { p_fecha: FECHA_ABIERTA, p_comida: 'almuerzo' })
      expect(error?.code).toBe('42501')
    }
  })
})
```

- [ ] **Paso 6: Verificar tipos y lint en local**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores. Si `typecheck` no resuelve `pg`, repetir la Tarea 1 (paso 2). **No** correr `npm run test:integracion` en local: aborta por `exigirBaseLocal()`.

- [ ] **Paso 7: Contar las pruebas**

```bash
grep -cE "^\s+it(\.each)?\(" tests/integration/comidas.test.ts
```

Esperado: `40` bloques `it`/`it.each`. Con los casos de `it.each` expandidos (2 + 8 + 5 + 13 + 4 + 3), Vitest informará **69 pruebas** (Tarea 6).

- [ ] **Paso 8: Commit**

```bash
git add tests/integration/comidas.test.ts
git commit -m "test(db): RLS, notas, paridad de comida_editable, guardar/volver y cierre de comidas"
```

---
### Tarea 3: Migración — tablas, `nota_valida`, `comida_editable` y RLS

**Archivos:**
- Crear: `supabase/migrations/<timestamp>_comidas.sql`

- [ ] **Paso 1: Crear el archivo de migración (no requiere Docker)**

```bash
npx supabase migration new comidas
```

Esperado: `Created new migration at supabase/migrations/2026091xxxxxxx_comidas.sql`.

- [ ] **Paso 2: Escribir la primera parte de la migración**

Contenido inicial del archivo creado (las tareas 4 y 5 agregan al final):

```sql
-- =========================================================
-- Pista 02-A: Comidas (esquema)
-- Spec §3.2 (plan_semanal, selecciones_comida, comidas_cerradas), §3.3, §5.2, §6.1–6.4, §8.3
-- Contrato con 02-B y 06-B: índice §4. No renombrar tablas ni funciones.
-- =========================================================

-- ---------- Nota según el estado (spec §3.3) ----------
-- temprano/tarde: hora HH:MM de 24 h; enfermo: texto no vacío de hasta 200 caracteres; resto: sin nota.
create or replace function public.nota_valida(p_estado public.estado_comida, p_nota text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_estado in ('temprano', 'tarde')
      then coalesce(p_nota ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$', false)
    when p_estado = 'enfermo'
      then coalesce(btrim(p_nota) <> '' and length(p_nota) <= 200, false)
    else p_nota is null
  end
$$;

-- ---------- Plan semanal ----------
create table public.plan_semanal (
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 1 and 7),
  comida public.tiempo_comida not null,
  estado public.estado_comida not null,
  nota text,
  primary key (usuario_id, dia_semana, comida),
  constraint plan_semanal_nota_valida check (public.nota_valida(estado, nota))
);

comment on table public.plan_semanal is
  'Patrón habitual por persona (1 = lunes … 7 = domingo). Sin fila = "Sin definir" en el plan.';

-- ---------- Selecciones (excepciones y valores congelados) ----------
create table public.selecciones_comida (
  usuario_id uuid not null references public.perfiles (id) on delete cascade,
  fecha date not null,
  comida public.tiempo_comida not null,
  estado public.estado_comida not null,
  nota text,
  origen public.origen_seleccion not null,
  actualizado_en timestamptz not null default now(),
  primary key (usuario_id, fecha, comida),
  constraint selecciones_comida_nota_valida check (public.nota_valida(estado, nota))
);

comment on table public.selecciones_comida is
  'origen = persona: excepción elegida; origen = plan: plan congelado al cerrar la comida (spec §6.3).';

create index selecciones_comida_fecha_comida_idx on public.selecciones_comida (fecha, comida);

-- ---------- Cierre definitivo ----------
create table public.comidas_cerradas (
  fecha date not null,
  comida public.tiempo_comida not null,
  cerrada_en timestamptz not null default now(),
  primary key (fecha, comida)
);

comment on table public.comidas_cerradas is
  'Una fila por comida cerrada. Solo la escribe cerrar_comidas_vencidas (o el servidor con la llave secreta).';

-- ---------- ¿Se puede editar la comida? (spec §6.1) ----------
-- 1) fecha entre el lunes de la semana actual y el domingo de la siguiente (hora local);
-- 2) p_ahora anterior al cierre calculado con horas_limite;
-- 3) sin fila en comidas_cerradas.
create or replace function public.comida_editable(
  p_fecha date,
  p_comida public.tiempo_comida,
  p_ahora timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with hoy as (
    select (p_ahora at time zone public.zona_horaria_app())::date as fecha
  ),
  semana as (
    select h.fecha - (extract(isodow from h.fecha)::int - 1) as lunes
    from hoy h
  )
  select
    p_fecha between s.lunes and s.lunes + 13
    and exists (
      select 1
      from public.horas_limite hl
      where hl.comida = p_comida
        and p_ahora < ((p_fecha + hl.dia_relativo) + hl.hora) at time zone public.zona_horaria_app()
    )
    and not exists (
      select 1
      from public.comidas_cerradas c
      where c.fecha = p_fecha and c.comida = p_comida
    )
  from semana s
$$;

revoke execute on function public.comida_editable(date, public.tiempo_comida, timestamptz) from public, anon;
grant execute on function public.comida_editable(date, public.tiempo_comida, timestamptz) to authenticated, service_role;

-- ---------- RLS: plan_semanal ----------
alter table public.plan_semanal enable row level security;

grant select, insert, update, delete on table public.plan_semanal to authenticated;

create policy "plan_semanal: lectura propia o de Administración"
  on public.plan_semanal for select
  to authenticated
  using (
    (select public.soy_activo())
    and (usuario_id = (select auth.uid()) or (select public.mi_rol()) = 'administracion')
  );

create policy "plan_semanal: la persona crea su plan"
  on public.plan_semanal for insert
  to authenticated
  with check (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
  );

create policy "plan_semanal: la persona edita su plan"
  on public.plan_semanal for update
  to authenticated
  using (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
  )
  with check (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
  );

create policy "plan_semanal: la persona borra su plan"
  on public.plan_semanal for delete
  to authenticated
  using (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
  );

-- ---------- RLS: selecciones_comida ----------
alter table public.selecciones_comida enable row level security;

grant select, insert, update, delete on table public.selecciones_comida to authenticated;

create policy "selecciones_comida: lectura propia o de Administración"
  on public.selecciones_comida for select
  to authenticated
  using (
    (select public.soy_activo())
    and (usuario_id = (select auth.uid()) or (select public.mi_rol()) = 'administracion')
  );

-- comida_editable depende de la fila: no se envuelve en (select …).
create policy "selecciones_comida: la persona crea en comidas abiertas"
  on public.selecciones_comida for insert
  to authenticated
  with check (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
    and public.comida_editable(fecha, comida)
  );

create policy "selecciones_comida: la persona edita en comidas abiertas"
  on public.selecciones_comida for update
  to authenticated
  using (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
    and public.comida_editable(fecha, comida)
  )
  with check (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
    and public.comida_editable(fecha, comida)
  );

create policy "selecciones_comida: la persona borra en comidas abiertas"
  on public.selecciones_comida for delete
  to authenticated
  using (
    (select public.soy_activo())
    and usuario_id = (select auth.uid())
    and (select public.mi_rol()) in ('director', 'residente')
    and public.comida_editable(fecha, comida)
  );

-- ---------- RLS: comidas_cerradas ----------
alter table public.comidas_cerradas enable row level security;

grant select on table public.comidas_cerradas to authenticated;
-- Nadie escribe con su sesión (spec §5.2): ni políticas ni privilegios.
revoke insert, update, delete on table public.comidas_cerradas from anon, authenticated;

create policy "comidas_cerradas: lectura para usuarios activos"
  on public.comidas_cerradas for select
  to authenticated
  using ((select public.soy_activo()));
```

- [ ] **Paso 3: Revisión rápida y commit**

```bash
grep -c "create policy" supabase/migrations/*_comidas.sql
git add supabase/migrations
git commit -m "feat(db): tablas de comidas, nota_valida, comida_editable y RLS"
```

Esperado: `9` políticas y commit sin errores.

---
### Tarea 4: Migración — `guardar_seleccion` y `volver_a_plan`

**Archivos:**
- Modificar: `supabase/migrations/<timestamp>_comidas.sql`

- [ ] **Paso 1: Agregar las funciones de escritura**

Agregar al final de la migración:

```sql
-- ---------- Guardar una selección (spec §6.4) ----------
-- security invoker: RLS sigue aplicando. La función solo agrega errores con código propio.
create or replace function public.guardar_seleccion(
  p_fecha date,
  p_comida public.tiempo_comida,
  p_estado public.estado_comida,
  p_nota text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_usuario uuid := auth.uid();
  v_rol public.rol := public.mi_rol();
  v_nota text := nullif(btrim(p_nota), '');
  v_plan_estado public.estado_comida;
  v_plan_nota text;
  v_hay_plan boolean;
begin
  -- mi_rol() es null si la cuenta está inactiva.
  if v_rol is null or v_rol not in ('director', 'residente') then
    raise exception 'Solo Directores y Residentes eligen sus comidas'
      using errcode = '42501';
  end if;

  if not public.comida_editable(p_fecha, p_comida) then
    raise exception 'La comida % del % ya cerró o está fuera de la semana editable', p_comida, p_fecha
      using errcode = 'MOL01';
  end if;

  if not public.nota_valida(p_estado, v_nota) then
    raise exception 'Nota inválida para el estado %', p_estado
      using errcode = 'MOL04';
  end if;

  select p.estado, p.nota
    into v_plan_estado, v_plan_nota
    from public.plan_semanal p
   where p.usuario_id = v_usuario
     and p.dia_semana = extract(isodow from p_fecha)::smallint
     and p.comida = p_comida;
  v_hay_plan := found;

  if v_hay_plan and v_plan_estado = p_estado and v_plan_nota is not distinct from v_nota then
    -- Igual al plan: no hace falta excepción.
    delete from public.selecciones_comida s
     where s.usuario_id = v_usuario
       and s.fecha = p_fecha
       and s.comida = p_comida;
  else
    insert into public.selecciones_comida (usuario_id, fecha, comida, estado, nota, origen)
    values (v_usuario, p_fecha, p_comida, p_estado, v_nota, 'persona')
    on conflict (usuario_id, fecha, comida) do update
      set estado = excluded.estado,
          nota = excluded.nota,
          origen = 'persona',
          actualizado_en = now();
  end if;
end;
$$;

-- ---------- Volver al plan (spec §6.4) ----------
create or replace function public.volver_a_plan(p_fecha date, p_comida public.tiempo_comida)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_rol public.rol := public.mi_rol();
begin
  if v_rol is null or v_rol not in ('director', 'residente') then
    raise exception 'Solo Directores y Residentes eligen sus comidas'
      using errcode = '42501';
  end if;

  if not public.comida_editable(p_fecha, p_comida) then
    raise exception 'La comida % del % ya cerró o está fuera de la semana editable', p_comida, p_fecha
      using errcode = 'MOL01';
  end if;

  delete from public.selecciones_comida s
   where s.usuario_id = auth.uid()
     and s.fecha = p_fecha
     and s.comida = p_comida
     and s.origen = 'persona';
end;
$$;

revoke execute on function public.guardar_seleccion(date, public.tiempo_comida, public.estado_comida, text) from public, anon;
revoke execute on function public.volver_a_plan(date, public.tiempo_comida) from public, anon;
grant execute on function public.guardar_seleccion(date, public.tiempo_comida, public.estado_comida, text) to authenticated;
grant execute on function public.volver_a_plan(date, public.tiempo_comida) to authenticated;
```

Notas:
- El `upsert` necesita las políticas SELECT, INSERT y UPDATE de `selecciones_comida` (Tarea 3); el `delete`, la política DELETE. Todas exigen `comida_editable`, así que si la comida cierra entre la verificación y la escritura, RLS la rechaza igual.
- Una fila con `origen = 'plan'` solo existe en comidas cerradas, donde `guardar_seleccion` ya lanzó `MOL01`.

- [ ] **Paso 2: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): guardar_seleccion y volver_a_plan con errores MOL01 y MOL04"
```

---

### Tarea 5: Migración — cierre de comidas, `pg_cron` y `comidas_sin_definir`

**Archivos:**
- Modificar: `supabase/migrations/<timestamp>_comidas.sql`

- [ ] **Paso 1: Agregar el procedimiento y el job de `pg_cron`**

Agregar al final de la migración:

```sql
-- ---------- Congelado al cerrar (spec §6.3) ----------
-- Restricciones para que COMMIT funcione: sin security definer, sin cláusula SET,
-- nombres con esquema, y el job de pg_cron ejecuta solo el CALL.
create or replace procedure public.cerrar_comidas_vencidas(p_ahora timestamptz default now())
language plpgsql
as $$
declare
  v_zona text := public.zona_horaria_app();
  v_hoy date := (p_ahora at time zone v_zona)::date;
  v_desde date := v_hoy - 7;
  v_hasta date := (v_hoy - (extract(isodow from v_hoy)::int - 1)) + 13;
  v_vencida record;
begin
  for v_vencida in
    select d.fecha, hl.comida
      from (
        select v_desde + g.n as fecha
          from pg_catalog.generate_series(0, v_hasta - v_desde) as g(n)
      ) d
      cross join public.horas_limite hl
     where ((d.fecha + hl.dia_relativo) + hl.hora) at time zone v_zona <= p_ahora
       and not exists (
         select 1
           from public.comidas_cerradas c
          where c.fecha = d.fecha and c.comida = hl.comida
       )
     order by d.fecha, hl.comida
  loop
    -- Directores/Residentes activos sin fila y con plan para ese día y comida.
    insert into public.selecciones_comida (usuario_id, fecha, comida, estado, nota, origen)
    select p.usuario_id, v_vencida.fecha, v_vencida.comida, p.estado, p.nota, 'plan'::public.origen_seleccion
      from public.plan_semanal p
      join public.perfiles pf on pf.id = p.usuario_id
     where pf.activo
       and pf.rol in ('director', 'residente')
       and p.dia_semana = extract(isodow from v_vencida.fecha)::smallint
       and p.comida = v_vencida.comida
    on conflict (usuario_id, fecha, comida) do nothing;

    insert into public.comidas_cerradas (fecha, comida)
    values (v_vencida.fecha, v_vencida.comida)
    on conflict (fecha, comida) do nothing;

    commit;
  end loop;
end;
$$;

-- ---------- Job de pg_cron cada 5 minutos (spec §8.3) ----------
-- La pista 06-A también habilita pg_cron; "if not exists" evita depender del orden de las migraciones.
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cerrar-comidas-vencidas') then
    perform cron.unschedule('cerrar-comidas-vencidas');
  end if;
end;
$$;

-- Solo el CALL en el comando: si hubiera otras sentencias, el COMMIT del procedimiento fallaría.
select cron.schedule(
  'cerrar-comidas-vencidas',
  '*/5 * * * *',
  'CALL public.cerrar_comidas_vencidas()'
);
```

- [ ] **Paso 2: Agregar `comidas_sin_definir` (contrato con 06-B)**

Agregar al final de la migración:

```sql
-- ---------- Recordatorios: quién tiene la comida "Sin definir" (spec §6.2, §8.2; índice §4) ----------
-- Directores/Residentes activos sin fila en selecciones_comida y, además,
-- sin plan para ese día y comida, o con la comida ya cerrada (el plan deja de contar).
create or replace function public.comidas_sin_definir(p_fecha date, p_comida public.tiempo_comida)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pf.id
    from public.perfiles pf
   where pf.activo
     and pf.rol in ('director', 'residente')
     and not exists (
       select 1
         from public.selecciones_comida s
        where s.usuario_id = pf.id
          and s.fecha = p_fecha
          and s.comida = p_comida
     )
     and (
       not exists (
         select 1
           from public.plan_semanal p
          where p.usuario_id = pf.id
            and p.dia_semana = extract(isodow from p_fecha)::smallint
            and p.comida = p_comida
       )
       or exists (
         select 1
           from public.comidas_cerradas c
          where c.fecha = p_fecha
            and c.comida = p_comida
       )
     )
$$;

revoke execute on function public.comidas_sin_definir(date, public.tiempo_comida) from public, anon, authenticated;
grant execute on function public.comidas_sin_definir(date, public.tiempo_comida) to service_role;
```

- [ ] **Paso 3: Revisión rápida del archivo completo**

```bash
grep -nE "security definer|set search_path|^create (or replace )?(function|procedure)" supabase/migrations/*_comidas.sql
```

Esperado:
- 5 líneas `create or replace function` (`nota_valida`, `comida_editable`, `guardar_seleccion`, `volver_a_plan`, `comidas_sin_definir`) y 1 `create or replace procedure` (`cerrar_comidas_vencidas`);
- `security definer` solo en `comida_editable` y `comidas_sin_definir`;
- `set search_path = ''` en las 5 funciones y **ninguna** línea `set` entre `create or replace procedure` y su `$$` final.

```bash
grep -c "cron.schedule" supabase/migrations/*_comidas.sql
```

Esperado: `1`.

- [ ] **Paso 4: Verificar tipos y lint en local**

```bash
npm run typecheck && npm run lint && npm test
```

Esperado: sin errores; las unitarias de la Fase 0 siguen en verde (esta parte no cambia código TS de la app).

- [ ] **Paso 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): cerrar_comidas_vencidas con pg_cron y comidas_sin_definir para recordatorios"
```

---

### Tarea 6: PR de esquema y verificación en CI

**Archivos:** ninguno nuevo (solo git y GitHub).

- [ ] **Paso 1: Actualizar con `master` y comprobar el orden de migraciones**

```bash
git fetch origin
git rebase origin/master
ls supabase/migrations | tail -n 3
```

Esperado: `<timestamp>_comidas.sql` es el último de la lista. Si otra pista mergeó una migración con timestamp posterior, renombrar la nuestra con un timestamp nuevo (índice §2.5: `supabase db push` rechaza migraciones anteriores a la última aplicada y el rebase no cambia el nombre):

```bash
git mv supabase/migrations/<timestamp-viejo>_comidas.sql "supabase/migrations/$(date -u +%Y%m%d%H%M%S)_comidas.sql"
git commit -m "chore(db): renueva timestamp de la migración de comidas"
```

Si el rebase trae `pg` desde otra pista y hay conflicto en `package.json` o `package-lock.json`: quedarse con la versión de `master` (`git checkout --theirs package.json package-lock.json` durante el rebase), ejecutar `npm install`, `git add package.json package-lock.json` y `git rebase --continue`.

- [ ] **Paso 2: Subir la rama y abrir el PR**

```bash
git push -u origin feat/comidas-esquema
gh pr create --base master --title "Comidas A: plan semanal, selecciones y cierre (esquema)" --body "Plan: docs/superpowers/plans/2026-09-16-02a-comidas-esquema.md. Migración y pruebas de integración; se verifican solo en CI. Contrato para 02-B y 06-B: índice §4."
```

- [ ] **Paso 3: Esperar CI**

```bash
gh pr checks --watch
```

Esperado: `calidad` y `base-de-datos` en verde. Si falla, ver el log con `gh run view --log-failed`, corregir, commitear y hacer `git push`. Fallas típicas:
- `supabase start` con error de sintaxis SQL → el log indica la línea de `<timestamp>_comidas.sql`;
- `invalid transaction termination` en el `CALL` → revisar que el procedimiento no tenga `SET` ni `security definer` y que `llamarCierre` no esté dentro de `begin`;
- `42883 function ... does not exist` en un RPC → nombres o tipos de parámetros distintos a los del contrato.

- [ ] **Paso 4: Confirmar que corrieron las pruebas de comidas**

```bash
gh run view "$(gh run list --branch feat/comidas-esquema --workflow ci.yml --limit 1 --json databaseId --jq '.[0].databaseId')" --log | grep "comidas.test.ts"
```

Esperado: una línea con `✓` y `tests/integration/comidas.test.ts (69 tests)`.

- [ ] **Paso 5: Revisión, merge y aplicación de la migración**

1. Pedir revisión al otro colaborador.
2. Si `master` avanzó antes del merge, repetir el Paso 1, subir con `git push --force-with-lease` y esperar CI de nuevo.
3. Con aprobación y CI en verde, mergear el PR en GitHub.
4. Verificar que la Action de despliegue aplicó la migración:

```bash
gh run list --workflow desplegar.yml --branch master --limit 1
gh run view "$(gh run list --workflow desplegar.yml --branch master --limit 1 --json databaseId --jq '.[0].databaseId')" --log | grep -i "_comidas.sql"
```

Esperado: estado `completed` y conclusión `success` para el commit del merge, y la línea `Applying migration <timestamp>_comidas.sql...`. Si aparece `skipped`, el dueño todavía no configuró el despliegue (spec Anexo A.2): las tablas no existen en el proyecto y **ni la Parte B ni 06-B pueden empezar**.

---

## Cobertura del spec en esta parte

| Spec | Dónde |
|---|---|
| §3.2 `plan_semanal`, `selecciones_comida`, `comidas_cerradas` | Tarea 3 |
| §3.3 nota obligatoria según estado; solo Director/Residente escriben | Tarea 3 (`nota_valida`, RLS); pruebas de CHECK y RLS |
| §5.2 RLS de las tres tablas | Tarea 3; `describe` de RLS |
| §6.1 `comida_editable` (ventana, hora, cierre definitivo) | Tarea 3; paridad con `casos-comidas.json` |
| §6.2 "Sin definir" con comida cerrada | Tarea 5 (`comidas_sin_definir`); pruebas de cierre y recordatorios |
| §6.3 congelado con `COMMIT` y `pg_cron` | Tarea 5; pruebas por `pg` con `p_ahora` explícito |
| §6.4 `guardar_seleccion`, `volver_a_plan`, `MOL01` | Tarea 4; pruebas de funciones |
| §9.2 independencia del reloj | Decisiones de esta parte; constantes de la Tarea 2 |
| §10 migración solo por la Action | Tarea 6 |
