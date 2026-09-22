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

  it('con su sesión siempre guarda origen "persona" y actualizado_en del servidor (trigger)', async () => {
    const residente = await clienteComo('residente')
    const falsa = { origen: 'plan', actualizado_en: '2000-01-01T00:00:00Z' }
    const alta = await residente.from('selecciones_comida').insert({ ...fila('residente', FECHA_ABIERTA), ...falsa })
    expect(alta.error).toBeNull()
    const leer = async () => {
      const { data, error } = await admin
        .from('selecciones_comida')
        .select('estado, origen, actualizado_en')
        .eq('usuario_id', ids.residente)
        .eq('fecha', FECHA_ABIERTA)
        .eq('comida', 'almuerzo')
        .single()
      if (error) throw error
      return data
    }
    const insertada = await leer()
    expect(insertada).toMatchObject({ estado: 'no', origen: 'persona' })
    expect(Date.parse(insertada.actualizado_en)).toBeGreaterThan(Date.parse('2020-01-01T00:00:00Z'))

    const edicion = await residente
      .from('selecciones_comida')
      .update({ estado: 'bolsa', ...falsa })
      .eq('usuario_id', ids.residente)
      .eq('fecha', FECHA_ABIERTA)
      .eq('comida', 'almuerzo')
    expect(edicion.error).toBeNull()
    const editada = await leer()
    expect(editada).toMatchObject({ estado: 'bolsa', origen: 'persona' })
    expect(Date.parse(editada.actualizado_en)).toBeGreaterThan(Date.parse('2020-01-01T00:00:00Z'))
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

  it(
    'el job real de pg_cron ejecuta el CALL con COMMIT y congela el plan',
    async () => {
      await ponerPlan('residente', DIA_ABIERTA, 'almuerzo', SI)

      await conPostgres(async (c) => {
        // Job temporal con el mismo tipo de comando que el real (solo el CALL), pero con un instante
        // fijo de 2030 para no depender de la hora del runner ni tocar comidas de la semana real.
        const { rows } = await c.query<{ jobid: string }>(
          "select cron.schedule('prueba-cierre-ci', '2 seconds', $$CALL public.cerrar_comidas_vencidas('2030-01-16T12:00:00-06:00')$$) as jobid",
        )
        const jobid = rows[0].jobid
        try {
          type Corrida = { status: string; return_message: string | null }
          let corrida: Corrida | undefined
          // Espera la primera corrida terminada (bien o mal): si falló, no seguimos esperando.
          await expect
            .poll(
              async () => {
                const terminadas = await c.query<Corrida>(
                  `select status, return_message from cron.job_run_details
                    where jobid = $1 and status in ('succeeded', 'failed')
                    order by runid limit 1`,
                  [jobid],
                )
                corrida = terminadas.rows[0]
                return corrida?.status ?? 'pendiente'
              },
              { timeout: 30_000, interval: 500 },
            )
            .toBeOneOf(['succeeded', 'failed'])
          expect(corrida?.status, `pg_cron: ${corrida?.return_message}`).toBe('succeeded')

          expect(await estaCerrada(MIERCOLES_2030, 'almuerzo')).toBe(true)
          expect(await leerSelecciones(MIERCOLES_2030, 'almuerzo')).toEqual([
            { usuario_id: ids.residente, estado: 'si', nota: null, origen: 'plan' },
          ])
        } finally {
          await c.query("select cron.unschedule('prueba-cierre-ci')")
          // Una corrida ya lanzada podría volver a cerrar 2030 después de la limpieza del afterEach:
          // esperamos a que no quede ninguna en curso ni recién iniciada.
          await expect
            .poll(
              async () => {
                const estado = await c.query<{ en_curso: number; reciente: boolean }>(
                  `select (count(*) filter (where status not in ('succeeded', 'failed')))::int as en_curso,
                          coalesce(max(start_time) > now() - interval '3 seconds', false) as reciente
                     from cron.job_run_details
                    where jobid = $1`,
                  [jobid],
                )
                return estado.rows[0]
              },
              { timeout: 30_000, interval: 500 },
            )
            .toEqual({ en_curso: 0, reciente: false })
          await c.query('delete from cron.job_run_details where jobid = $1', [jobid])
        }
      })
    },
    120_000,
  )

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
