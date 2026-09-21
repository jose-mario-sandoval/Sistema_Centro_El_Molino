import { Client } from 'pg'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fechaISOEn, lunesDe, sumarDias } from '@/lib/fechas'
import { exigirBaseLocal } from '../soporte/entorno-local'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

/*
 * Ausencias: días en que una persona no está en la casa. Sus comidas de esos días se cancelan solas.
 * Valor efectivo: selección de la persona → ausencia → plan → "Sin definir". Lo que ya cerró no se toca.
 *
 * Todo con fechas relativas a hoy y sin depender de la hora del día:
 *  - AYER: sus tres comidas ya vencieron con cualquier hora límite, y todavía puede no estar congelado
 *    (el job de pg_cron corre cada 5 minutos). Es la ventana que hay que proteger.
 *  - FECHA_ABIERTA: miércoles de la semana siguiente; siempre editable.
 */

const admin = clienteAdminPrueba()
let ids: Record<ClaveUsuario, string>

const HOY = fechaISOEn(new Date())
const AYER = sumarDias(HOY, -1)
const FECHA_ABIERTA = sumarDias(lunesDe(HOY), 9)
const COMIDAS = ['desayuno', 'almuerzo', 'cena'] as const

beforeAll(async () => {
  ids = await asegurarUsuariosPrueba()
})

afterEach(async () => {
  const usuarios = Object.values(ids)
  // Quitar las ausencias congela lo vencido: primero ellas y después lo que hayan escrito.
  await admin.from('ausencias').delete().in('usuario_id', usuarios)
  await admin.from('selecciones_comida').delete().in('usuario_id', usuarios)
  await admin.from('plan_semanal').delete().in('usuario_id', usuarios)
  await admin.from('comidas_cerradas').delete().eq('fecha', AYER)
  await asegurarUsuariosPrueba()
})

async function planTodoSi(clave: ClaveUsuario) {
  const filas = []
  for (let dia = 1; dia <= 7; dia++) for (const comida of COMIDAS) filas.push({ usuario_id: ids[clave], dia_semana: dia, comida, estado: 'si', nota: null })
  const { error } = await admin.from('plan_semanal').insert(filas)
  if (error) throw error
}

/** La ausencia ya existía cuando venció la comida: se inserta sin que el trigger congele. */
async function ausenciaYaExistente(clave: ClaveUsuario, desde: string, hasta: string) {
  await conPostgres(async (c) => {
    await c.query('alter table public.ausencias disable trigger ausencias_congelar_antes')
    try {
      await c.query('insert into public.ausencias (usuario_id, desde, hasta) values ($1, $2, $3)', [ids[clave], desde, hasta])
    } finally {
      await c.query('alter table public.ausencias enable trigger ausencias_congelar_antes')
    }
  })
}

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

/** CALL por protocolo simple y fuera de transacción: el procedimiento hace COMMIT. */
async function cerrarVencidas() {
  await conPostgres((c) => c.query('call public.cerrar_comidas_vencidas()'))
}

type Fila = { comida: string; estado: string; nota: string | null; origen: string }
async function seleccionesDe(clave: ClaveUsuario, fecha: string): Promise<Fila[]> {
  const { data, error } = await admin
    .from('selecciones_comida')
    .select('comida, estado, nota, origen')
    .eq('usuario_id', ids[clave])
    .eq('fecha', fecha)
    .order('comida')
  if (error) throw error
  return data as Fila[]
}

const cadaComida = (filas: Fila[], esperado: Partial<Fila>) => {
  // Sin depender del orden en que la base devuelve los enums.
  expect(filas.map((f) => f.comida).sort()).toEqual(['almuerzo', 'cena', 'desayuno'])
  for (const fila of filas) expect(fila).toMatchObject(esperado)
}

describe('ausencias: quién las ve y quién las escribe', () => {
  it('una persona registra su propia ausencia y solo ella la ve', async () => {
    const residente = await clienteComo('residente')
    const { error } = await residente.from('ausencias').insert({ usuario_id: ids.residente, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA })
    expect(error).toBeNull()

    for (const [clave, esperadas] of [
      ['residente', 1],
      ['residente2', 0],
      ['director', 0],
      ['administracion', 0],
    ] as const) {
      const cliente = await clienteComo(clave)
      const { data } = await cliente.from('ausencias').select('id')
      expect(data, clave).toHaveLength(esperadas)
    }
  })

  it('no puede registrarla a nombre de otra persona', async () => {
    const residente = await clienteComo('residente')
    const { error } = await residente.from('ausencias').insert({ usuario_id: ids.residente2, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA })
    expect(error?.code).toBe('42501')
  })

  it('no puede registrar una ausencia que ya pasó por completo', async () => {
    const residente = await clienteComo('residente')
    const { error } = await residente.from('ausencias').insert({ usuario_id: ids.residente, desde: AYER, hasta: AYER })
    expect(error?.code).toBe('42501')
  })

  it.each([
    ['hasta antes de desde', () => ({ desde: sumarDias(HOY, 5), hasta: sumarDias(HOY, 3) })],
    ['más de un año', () => ({ desde: HOY, hasta: sumarDias(HOY, 400) })],
  ])('la base rechaza un rango inválido: %s', async (_caso, rango) => {
    const { error } = await admin.from('ausencias').insert({ usuario_id: ids.residente, ...rango() })
    expect(error?.code).toBe('23514')
  })

  it('Administración no registra ausencias', async () => {
    const cocina = await clienteComo('administracion')
    const { error } = await cocina.from('ausencias').insert({ usuario_id: ids.administracion, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA })
    expect(error?.code).toBe('42501')
  })

  it('nadie modifica un rango: se quita y se vuelve a marcar', async () => {
    const { data } = await admin.from('ausencias').insert({ usuario_id: ids.residente, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA }).select('id').single()
    const residente = await clienteComo('residente')
    const { error } = await residente.from('ausencias').update({ hasta: sumarDias(FECHA_ABIERTA, 2) }).eq('id', data!.id)
    expect(error?.code).toBe('42501')
  })

  it('otra persona no puede quitarla', async () => {
    const { data } = await admin.from('ausencias').insert({ usuario_id: ids.residente, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA }).select('id').single()
    const otra = await clienteComo('residente2')
    await otra.from('ausencias').delete().eq('id', data!.id)
    const { data: sigue } = await admin.from('ausencias').select('id').eq('id', data!.id)
    expect(sigue).toHaveLength(1)
  })
})

describe('ausentes_en: lo único que Administración sabe', () => {
  it('Administración obtiene quién está ausente ese día, una sola vez aunque los rangos se solapen', async () => {
    await admin.from('ausencias').insert([
      { usuario_id: ids.residente, desde: FECHA_ABIERTA, hasta: sumarDias(FECHA_ABIERTA, 2) },
      { usuario_id: ids.residente, desde: FECHA_ABIERTA, hasta: sumarDias(FECHA_ABIERTA, 4) },
    ])
    const cocina = await clienteComo('administracion')
    const { data, error } = await cocina.rpc('ausentes_en', { p_fecha: FECHA_ABIERTA })
    expect(error).toBeNull()
    expect(data).toEqual([ids.residente])

    const fuera = await cocina.rpc('ausentes_en', { p_fecha: sumarDias(FECHA_ABIERTA, 30) })
    expect(fuera.data).toEqual([])
  })

  it.each(['residente', 'director'] as const)('%s no obtiene nada: las ausencias son privadas', async (clave) => {
    await admin.from('ausencias').insert({ usuario_id: ids.residente, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA })
    const cliente = await clienteComo(clave)
    const { data } = await cliente.rpc('ausentes_en', { p_fecha: FECHA_ABIERTA })
    expect(data).toEqual([])
  })
})

describe('ausencias: la referencia de la persona es "No comer"', () => {
  async function guardar(clave: ClaveUsuario, estado: string) {
    const cliente = await clienteComo(clave)
    return cliente.rpc('guardar_seleccion', { p_fecha: FECHA_ABIERTA, p_comida: 'almuerzo', p_estado: estado, p_nota: null })
  }

  it('estando ausente, elegir "No comer" no es una excepción; reactivar la comida sí', async () => {
    await planTodoSi('residente')
    await admin.from('ausencias').insert({ usuario_id: ids.residente, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA })

    expect((await guardar('residente', 'no')).error).toBeNull()
    expect(await seleccionesDe('residente', FECHA_ABIERTA)).toEqual([])

    expect((await guardar('residente', 'si')).error).toBeNull()
    expect(await seleccionesDe('residente', FECHA_ABIERTA)).toMatchObject([{ comida: 'almuerzo', estado: 'si', origen: 'persona' }])

    const residente = await clienteComo('residente')
    const volver = await residente.rpc('volver_a_plan', { p_fecha: FECHA_ABIERTA, p_comida: 'almuerzo' })
    expect(volver.error).toBeNull()
    expect(await seleccionesDe('residente', FECHA_ABIERTA)).toEqual([])
  })

  it('sin ausencia todo sigue como antes: lo mismo que el plan no es excepción', async () => {
    await planTodoSi('residente')
    expect((await guardar('residente', 'si')).error).toBeNull()
    expect(await seleccionesDe('residente', FECHA_ABIERTA)).toEqual([])
    expect((await guardar('residente', 'no')).error).toBeNull()
    expect(await seleccionesDe('residente', FECHA_ABIERTA)).toMatchObject([{ estado: 'no', origen: 'persona' }])
  })

  it('con ausencia y sin plan, "No comer" tampoco es excepción', async () => {
    await admin.from('ausencias').insert({ usuario_id: ids.residente2, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA })
    expect((await guardar('residente2', 'no')).error).toBeNull()
    expect(await seleccionesDe('residente2', FECHA_ABIERTA)).toEqual([])
    expect((await guardar('residente2', 'bolsa')).error).toBeNull()
    expect(await seleccionesDe('residente2', FECHA_ABIERTA)).toHaveLength(1)
  })
})

describe('ausencias: lo que ya cerró no se toca', () => {
  it('el job de cierre congela a quien está ausente en "No comer", tenga o no plan', async () => {
    await planTodoSi('residente')
    await ausenciaYaExistente('residente', AYER, AYER)
    await ausenciaYaExistente('residente2', AYER, AYER) // sin plan
    await cerrarVencidas()

    cadaComida(await seleccionesDe('residente', AYER), { estado: 'no', nota: null, origen: 'ausencia' })
    cadaComida(await seleccionesDe('residente2', AYER), { estado: 'no', nota: null, origen: 'ausencia' })
  })

  it('una elección suya (reactivó una comida) gana sobre la ausencia y no se pisa', async () => {
    await ausenciaYaExistente('residente', AYER, AYER)
    await admin.from('selecciones_comida').insert({ usuario_id: ids.residente, fecha: AYER, comida: 'cena', estado: 'si', origen: 'persona' })
    await cerrarVencidas()

    const filas = await seleccionesDe('residente', AYER)
    expect(filas.find((f) => f.comida === 'cena')).toMatchObject({ estado: 'si', origen: 'persona' })
    expect(filas.find((f) => f.comida === 'almuerzo')).toMatchObject({ estado: 'no', origen: 'ausencia' })
  })

  it('agregar una ausencia sobre comidas ya vencidas las congela con lo que valían (el plan)', async () => {
    await planTodoSi('residente')
    const residente = await clienteComo('residente')
    const { error } = await residente.from('ausencias').insert({ usuario_id: ids.residente, desde: AYER, hasta: sumarDias(HOY, 2) })
    expect(error).toBeNull()

    // La cocina ya contaba con esa persona ayer: agregar la ausencia después no lo cambia.
    cadaComida(await seleccionesDe('residente', AYER), { estado: 'si', origen: 'plan' })
    // Una fecha futura no se congela.
    expect(await seleccionesDe('residente', FECHA_ABIERTA)).toEqual([])

    await cerrarVencidas()
    cadaComida(await seleccionesDe('residente', AYER), { estado: 'si', origen: 'plan' })
  })

  it('quitar una ausencia sobre comidas ya vencidas las congela en "No comer": no cambia lo que la cocina contó', async () => {
    await planTodoSi('residente')
    await ausenciaYaExistente('residente', AYER, sumarDias(HOY, 2))
    const residente = await clienteComo('residente')
    const { data } = await residente.from('ausencias').select('id').eq('usuario_id', ids.residente).single()
    const { error } = await residente.from('ausencias').delete().eq('id', data!.id)
    expect(error).toBeNull()

    cadaComida(await seleccionesDe('residente', AYER), { estado: 'no', origen: 'ausencia' })
    await cerrarVencidas()
    cadaComida(await seleccionesDe('residente', AYER), { estado: 'no', origen: 'ausencia' })
  })

  it('agregar o quitar una ausencia solo futura no escribe ninguna comida', async () => {
    await planTodoSi('residente')
    const residente = await clienteComo('residente')
    const { data } = await residente
      .from('ausencias')
      .insert({ usuario_id: ids.residente, desde: FECHA_ABIERTA, hasta: sumarDias(FECHA_ABIERTA, 3) })
      .select('id')
      .single()
    expect(await seleccionesDe('residente', FECHA_ABIERTA)).toEqual([])
    await residente.from('ausencias').delete().eq('id', data!.id)
    expect(await seleccionesDe('residente', FECHA_ABIERTA)).toEqual([])
  })

  it('una comida ya congelada no se pisa', async () => {
    await admin.from('selecciones_comida').insert({ usuario_id: ids.residente, fecha: AYER, comida: 'almuerzo', estado: 'bolsa', origen: 'plan' })
    await admin.from('ausencias').insert({ usuario_id: ids.residente, desde: AYER, hasta: AYER })
    const almuerzo = (await seleccionesDe('residente', AYER)).find((f) => f.comida === 'almuerzo')
    expect(almuerzo).toMatchObject({ estado: 'bolsa', origen: 'plan' })
  })
})

describe('ausencias: recordatorios', () => {
  it('quien está ausente ya tiene su comida definida y no recibe el recordatorio', async () => {
    const sinDefinir = async () => {
      const { data, error } = await admin.rpc('comidas_sin_definir', { p_fecha: FECHA_ABIERTA, p_comida: 'almuerzo' })
      if (error) throw error
      return data as string[]
    }
    expect(await sinDefinir()).toContain(ids.residente2)

    await admin.from('ausencias').insert({ usuario_id: ids.residente2, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA })
    expect(await sinDefinir()).not.toContain(ids.residente2)
  })
})
