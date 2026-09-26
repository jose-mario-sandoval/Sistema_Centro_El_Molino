import { Client } from 'pg'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { diaSemana, fechaISOEn, lunesDe, sumarDias } from '@/lib/fechas'
import { exigirBaseLocal } from '../soporte/entorno-local'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

/*
 * "La casa" del Director: ve y cambia la semana, el plan y las ausencias de cualquier persona activa
 * con comidas, con los mismos cierres que todos. Quién cambió queda en modificado_por / creado_por.
 * Extras manuales para la cocina, sin autor. Espejo de probar-la-casa.mjs (banco local).
 *
 * Fechas relativas a hoy, sin depender de la hora:
 *  - AYER: sus tres comidas ya vencieron con cualquier hora límite (y el job pudo no congelarlas).
 *  - FECHA_ABIERTA: miércoles de la semana siguiente; siempre editable.
 */

const admin = clienteAdminPrueba()
let ids: Record<ClaveUsuario, string>

const HOY = fechaISOEn(new Date())
const AYER = sumarDias(HOY, -1)
const DIA_AYER = diaSemana(AYER)
const FECHA_ABIERTA = sumarDias(lunesDe(HOY), 9)
const DIA_ABIERTA = 3
const COMIDAS = ['desayuno', 'almuerzo', 'cena'] as const

beforeAll(async () => {
  ids = await asegurarUsuariosPrueba()
})

afterEach(async () => {
  const usuarios = Object.values(ids)
  // Ausencias y planes antes que las selecciones: quitarlos congela lo vencido (triggers).
  for (const tabla of ['ausencias', 'plan_semanal', 'selecciones_comida'] as const) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', usuarios)
    if (error) throw error
  }
  const extras = await admin.from('extras_manuales').delete().in('creado_por', usuarios)
  if (extras.error) throw extras.error
  const cerradas = await admin.from('comidas_cerradas').delete().in('fecha', [AYER, FECHA_ABIERTA])
  if (cerradas.error) throw cerradas.error
  await asegurarUsuariosPrueba()
})

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

/** AYER vencido pero sin congelar: el job real de pg_cron pudo haberlo cerrado desde la limpieza. */
async function ayerSinCerrar() {
  const { error } = await admin.from('comidas_cerradas').delete().eq('fecha', AYER)
  if (error) throw error
  const selecciones = await admin.from('selecciones_comida').delete().eq('fecha', AYER).in('usuario_id', Object.values(ids))
  if (selecciones.error) throw selecciones.error
}

async function planTodoSi(clave: ClaveUsuario) {
  const filas = []
  for (let dia = 1; dia <= 7; dia++) for (const comida of COMIDAS) filas.push({ usuario_id: ids[clave], dia_semana: dia, comida, estado: 'si', nota: null })
  const { error } = await admin.from('plan_semanal').insert(filas)
  if (error) throw error
}

async function desactivar(clave: ClaveUsuario) {
  const { error } = await admin.from('perfiles').update({ activo: false }).eq('id', ids[clave])
  if (error) throw error
}

type Fila = { comida: string; estado: string; nota: string | null; origen: string; modificado_por: string | null }
async function seleccionesDe(clave: ClaveUsuario, fecha: string): Promise<Fila[]> {
  const { data, error } = await admin
    .from('selecciones_comida')
    .select('comida, estado, nota, origen, modificado_por')
    .eq('usuario_id', ids[clave])
    .eq('fecha', fecha)
  if (error) throw error
  return data as Fila[]
}
const deComida = (filas: Fila[], comida: string) => filas.find((f) => f.comida === comida)

async function guardarDe(quien: ClaveUsuario, deQuien: ClaveUsuario, fecha: string, estado: string, nota: string | null = null, comida = 'almuerzo') {
  const cliente = await clienteComo(quien)
  return cliente.rpc('guardar_seleccion_de', { p_usuario: ids[deQuien], p_fecha: fecha, p_comida: comida, p_estado: estado, p_nota: nota })
}

async function volverDe(quien: ClaveUsuario, deQuien: ClaveUsuario, fecha: string, comida = 'almuerzo') {
  const cliente = await clienteComo(quien)
  return cliente.rpc('volver_a_plan_de', { p_usuario: ids[deQuien], p_fecha: fecha, p_comida: comida })
}

describe('lectura: el Director ve plan, selecciones y ausencias de todos', () => {
  it('cada rol ve lo que le corresponde', async () => {
    await admin.from('plan_semanal').insert([
      { usuario_id: ids.residente, dia_semana: 1, comida: 'cena', estado: 'si' },
      { usuario_id: ids.residente2, dia_semana: 1, comida: 'cena', estado: 'no' },
    ])
    await admin.from('selecciones_comida').insert([
      { usuario_id: ids.residente, fecha: FECHA_ABIERTA, comida: 'almuerzo', estado: 'no', origen: 'persona' },
      { usuario_id: ids.residente2, fecha: FECHA_ABIERTA, comida: 'almuerzo', estado: 'bolsa', origen: 'persona' },
    ])
    await admin.from('ausencias').insert([
      { usuario_id: ids.residente, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA },
      { usuario_id: ids.residente2, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA },
    ])
    const residentes = [ids.residente, ids.residente2]

    const esperado: Record<string, Partial<Record<ClaveUsuario, number>>> = {
      plan_semanal: { director: 2, director2: 2, residente: 1, administracion: 2 },
      selecciones_comida: { director: 2, director2: 2, residente: 1, administracion: 2 },
      ausencias: { director: 2, director2: 2, residente: 1, administracion: 0 },
    }
    for (const [tabla, porClave] of Object.entries(esperado)) {
      for (const [clave, cantidad] of Object.entries(porClave) as [ClaveUsuario, number][]) {
        const cliente = await clienteComo(clave)
        const { data, error } = await cliente.from(tabla).select('usuario_id').in('usuario_id', residentes)
        expect(error, `${tabla} ${clave}`).toBeNull()
        expect(data, `${tabla} ${clave}`).toHaveLength(cantidad)
      }
    }
  })
})

describe('guardar_seleccion_de: el Director elige por otra persona con los mismos cierres', () => {
  it('queda como excepción de la persona, con modificado_por = el Director', async () => {
    await planTodoSi('residente')
    expect((await guardarDe('director', 'residente', FECHA_ABIERTA, 'no')).error).toBeNull()
    expect(deComida(await seleccionesDe('residente', FECHA_ABIERTA), 'almuerzo')).toMatchObject({
      estado: 'no',
      origen: 'persona',
      modificado_por: ids.director,
    })
  })

  it('igual al plan de esa persona: se borra la excepción', async () => {
    await planTodoSi('residente')
    await guardarDe('director', 'residente', FECHA_ABIERTA, 'no')
    expect((await guardarDe('director', 'residente', FECHA_ABIERTA, 'si')).error).toBeNull()
    expect(await seleccionesDe('residente', FECHA_ABIERTA)).toEqual([])
  })

  it('una comida vencida de otra persona: MOL01', async () => {
    const { error } = await guardarDe('director', 'residente', AYER, 'no')
    expect(error?.code).toBe('MOL01')
  })

  it.each([
    ['director', 'administracion'],
    ['residente', 'residente2'],
    ['residente', 'director'],
    ['administracion', 'residente'],
  ] as const)('%s por %s: 42501', async (quien, deQuien) => {
    const { error } = await guardarDe(quien, deQuien, FECHA_ABIERTA, 'no')
    expect(error?.code).toBe('42501')
  })

  it('para una persona inactiva: 42501', async () => {
    await desactivar('residente2')
    const { error } = await guardarDe('director', 'residente2', FECHA_ABIERTA, 'no')
    expect(error?.code).toBe('42501')
  })

  it('el Director para sí mismo, o la persona que la vuelve a cambiar: modificado_por null', async () => {
    await guardarDe('director', 'director', FECHA_ABIERTA, 'bolsa')
    expect(deComida(await seleccionesDe('director', FECHA_ABIERTA), 'almuerzo')?.modificado_por).toBeNull()

    await guardarDe('director', 'residente', FECHA_ABIERTA, 'no')
    const residente = await clienteComo('residente')
    const { error } = await residente.rpc('guardar_seleccion', { p_fecha: FECHA_ABIERTA, p_comida: 'almuerzo', p_estado: 'bolsa', p_nota: null })
    expect(error).toBeNull()
    expect(deComida(await seleccionesDe('residente', FECHA_ABIERTA), 'almuerzo')).toMatchObject({ estado: 'bolsa', modificado_por: null })
  })

  it('con una ausencia de esa persona, "No comer" es la referencia también cuando actúa el Director', async () => {
    await planTodoSi('residente')
    await admin.from('ausencias').insert({ usuario_id: ids.residente, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA })
    expect((await guardarDe('director', 'residente', FECHA_ABIERTA, 'no')).error).toBeNull()
    expect(await seleccionesDe('residente', FECHA_ABIERTA)).toEqual([])
  })
})

describe('volver_a_plan_de', () => {
  it('el Director devuelve la comida de otra persona a su plan', async () => {
    await planTodoSi('residente')
    await guardarDe('director', 'residente', FECHA_ABIERTA, 'no')
    expect((await volverDe('director', 'residente', FECHA_ABIERTA)).error).toBeNull()
    expect(await seleccionesDe('residente', FECHA_ABIERTA)).toEqual([])
  })

  it('un Residente no lo hace por otra persona, y nunca borra lo congelado', async () => {
    await admin.from('selecciones_comida').insert([
      { usuario_id: ids.residente2, fecha: FECHA_ABIERTA, comida: 'almuerzo', estado: 'no', origen: 'persona' },
      { usuario_id: ids.residente2, fecha: FECHA_ABIERTA, comida: 'cena', estado: 'si', origen: 'plan' },
    ])
    expect((await volverDe('residente', 'residente2', FECHA_ABIERTA)).error?.code).toBe('42501')
    expect((await volverDe('director', 'residente2', FECHA_ABIERTA, 'cena')).error).toBeNull()
    expect(await seleccionesDe('residente2', FECHA_ABIERTA)).toHaveLength(2)
  })
})

describe('plan_semanal: escrituras directas', () => {
  it('el Director crea y edita el plan de otra persona; queda quién lo cambió', async () => {
    const director = await clienteComo('director')
    const fila = { usuario_id: ids.residente, dia_semana: DIA_ABIERTA, comida: 'cena', estado: 'si' }
    expect((await director.from('plan_semanal').insert(fila)).error).toBeNull()
    const { data } = await admin.from('plan_semanal').select('estado, modificado_por').eq('usuario_id', ids.residente).single()
    expect(data).toEqual({ estado: 'si', modificado_por: ids.director })

    const residente = await clienteComo('residente')
    await residente.from('plan_semanal').update({ estado: 'no' }).eq('usuario_id', ids.residente)
    const { data: propia } = await admin.from('plan_semanal').select('estado, modificado_por').eq('usuario_id', ids.residente).single()
    expect(propia).toEqual({ estado: 'no', modificado_por: null })
  })

  it('un Director edita el plan de otro Director', async () => {
    await admin.from('plan_semanal').insert({ usuario_id: ids.director, dia_semana: 1, comida: 'almuerzo', estado: 'si' })
    const director2 = await clienteComo('director2')
    const { data } = await director2.from('plan_semanal').update({ estado: 'no' }).eq('usuario_id', ids.director).select('modificado_por')
    expect(data).toEqual([{ modificado_por: ids.director2 }])
  })

  it('nadie más escribe planes ajenos', async () => {
    const residente = await clienteComo('residente')
    const { error } = await residente.from('plan_semanal').insert({ usuario_id: ids.residente2, dia_semana: 1, comida: 'cena', estado: 'si' })
    expect(error?.code).toBe('42501')
    const director = await clienteComo('director')
    const { error: errorAdministracion } = await director
      .from('plan_semanal')
      .insert({ usuario_id: ids.administracion, dia_semana: 1, comida: 'cena', estado: 'si' })
    expect(errorAdministracion?.code).toBe('42501')
  })
})

describe('ausencias que marca el Director', () => {
  it('congela antes lo ya vencido, guarda quién la marcó y la persona la ve', async () => {
    await planTodoSi('residente')
    const director = await clienteComo('director')
    await ayerSinCerrar()
    const { data, error } = await director
      .from('ausencias')
      .insert({ usuario_id: ids.residente, desde: AYER, hasta: sumarDias(HOY, 2) })
      .select('id, creado_por')
      .single()
    expect(error).toBeNull()
    expect(data!.creado_por).toBe(ids.director)
    // La cocina ya contaba con esa persona ayer: agregar la ausencia después no lo cambia.
    for (const fila of await seleccionesDe('residente', AYER)) expect(fila).toMatchObject({ estado: 'si', origen: 'plan', modificado_por: null })
    expect(await seleccionesDe('residente', AYER)).toHaveLength(3)

    const residente = await clienteComo('residente')
    const { data: suya } = await residente.from('ausencias').select('id, creado_por')
    expect(suya).toEqual([{ id: data!.id, creado_por: ids.director }])

    const otra = await clienteComo('residente2')
    const { data: borradaPorOtra } = await otra.from('ausencias').delete().eq('id', data!.id).select('id')
    expect(borradaPorOtra).toEqual([])

    const { data: borrada } = await director.from('ausencias').delete().eq('id', data!.id).select('id')
    expect(borrada).toEqual([{ id: data!.id }])
  })

  it('la que marca la propia persona queda sin creado_por, aunque mande otro', async () => {
    const residente = await clienteComo('residente')
    const { data } = await residente
      .from('ausencias')
      .insert({ usuario_id: ids.residente, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA, creado_por: ids.director })
      .select('creado_por')
      .single()
    expect(data).toEqual({ creado_por: null })
  })

  it('ni para Administración, ni entera en el pasado', async () => {
    const director = await clienteComo('director')
    const paraAdministracion = await director.from('ausencias').insert({ usuario_id: ids.administracion, desde: FECHA_ABIERTA, hasta: FECHA_ABIERTA })
    expect(paraAdministracion.error?.code).toBe('42501')
    const pasada = await director.from('ausencias').insert({ usuario_id: ids.residente, desde: AYER, hasta: AYER })
    expect(pasada.error?.code).toBe('42501')
  })
})

describe('congelado del plan: cambiarlo después del cierre no cambia lo que contó la cocina', () => {
  it('editar la celda congela antes la comida vencida con el valor anterior', async () => {
    await planTodoSi('residente')
    const residente = await clienteComo('residente')
    await ayerSinCerrar()
    const { error } = await residente
      .from('plan_semanal')
      .update({ estado: 'no' })
      .eq('usuario_id', ids.residente)
      .eq('dia_semana', DIA_AYER)
      .eq('comida', 'almuerzo')
    expect(error).toBeNull()
    expect(deComida(await seleccionesDe('residente', AYER), 'almuerzo')).toMatchObject({ estado: 'si', origen: 'plan' })

    // Sin el congelado, el job tomaría el plan nuevo ("No comer").
    await cerrarVencidas()
    expect(deComida(await seleccionesDe('residente', AYER), 'almuerzo')).toMatchObject({ estado: 'si', origen: 'plan' })
  })

  it('con una ausencia ese día, lo congelado es "No comer"', async () => {
    await planTodoSi('residente')
    await ausenciaYaExistente('residente', AYER, AYER)
    const director = await clienteComo('director')
    await ayerSinCerrar()
    await director
      .from('plan_semanal')
      .update({ estado: 'bolsa' })
      .eq('usuario_id', ids.residente)
      .eq('dia_semana', DIA_AYER)
      .eq('comida', 'almuerzo')
    expect(deComida(await seleccionesDe('residente', AYER), 'almuerzo')).toMatchObject({ estado: 'no', origen: 'ausencia' })
  })

  it('una comida ya cerrada "Sin definir" no recibe el valor del plan nuevo', async () => {
    await ayerSinCerrar()
    await cerrarVencidas() // residente2 sin plan ni ausencia: ayer queda "Sin definir"
    const residente2 = await clienteComo('residente2')
    await residente2.from('plan_semanal').insert({ usuario_id: ids.residente2, dia_semana: DIA_AYER, comida: 'almuerzo', estado: 'si' })
    await residente2.from('plan_semanal').update({ estado: 'no' }).eq('usuario_id', ids.residente2)
    expect(await seleccionesDe('residente2', AYER)).toEqual([])
  })

  it('el job no pisa lo que cambió el Director ni le pone autor a lo congelado', async () => {
    await planTodoSi('residente')
    await ayerSinCerrar()
    await admin
      .from('selecciones_comida')
      .insert({ usuario_id: ids.residente, fecha: AYER, comida: 'cena', estado: 'no', origen: 'persona', modificado_por: ids.director })
    await cerrarVencidas()
    const filas = await seleccionesDe('residente', AYER)
    expect(deComida(filas, 'desayuno')).toMatchObject({ origen: 'plan', modificado_por: null })
    expect(deComida(filas, 'cena')).toMatchObject({ estado: 'no', modificado_por: ids.director })
  })
})

describe('extras manuales', () => {
  it('solo el Director agrega, desde hoy, y a su nombre', async () => {
    for (const clave of ['residente', 'administracion'] as const) {
      const cliente = await clienteComo(clave)
      const { error } = await cliente.from('extras_manuales').insert({ fecha: FECHA_ABIERTA, tiempo_comida: 'cena', cantidad: 2 })
      expect(error?.code, clave).toBe('42501')
    }
    const director = await clienteComo('director')
    const { data, error } = await director
      .from('extras_manuales')
      .insert({ fecha: FECHA_ABIERTA, tiempo_comida: 'cena', cantidad: 2, nota: 'Sin sal' })
      .select('creado_por')
      .single()
    expect(error).toBeNull()
    expect(data).toEqual({ creado_por: ids.director })

    const pasado = await director.from('extras_manuales').insert({ fecha: AYER, tiempo_comida: 'cena', cantidad: 2 })
    expect(pasado.error?.code).toBe('42501')
  })

  it('la cocina y el Director ven la cifra (sumada) y la nota, nunca el autor; un residente nada', async () => {
    // Otras pruebas dejan cenas confirmadas por el enlace público (eventos): se suman a lo manual.
    const totalCena = async (clave: ClaveUsuario) => {
      const cliente = await clienteComo(clave)
      const { data, error } = await cliente.rpc('extras_de_la_semana', { p_desde: FECHA_ABIERTA, p_hasta: FECHA_ABIERTA })
      if (error) throw error
      return (data as { tiempo_comida: string; total: number }[]).find((f) => f.tiempo_comida === 'cena')?.total ?? 0
    }
    const antes = await totalCena('administracion')

    const director = await clienteComo('director')
    await director.from('extras_manuales').insert([
      { fecha: FECHA_ABIERTA, tiempo_comida: 'cena', cantidad: 2, nota: 'Sin sal' },
      { fecha: FECHA_ABIERTA, tiempo_comida: 'cena', cantidad: 3 },
    ])

    for (const clave of ['administracion', 'director'] as const) {
      expect(await totalCena(clave), clave).toBe(antes + 5)
      const cliente = await clienteComo(clave)

      const { data: notas } = await cliente.rpc('extras_manuales_de_la_semana', { p_desde: FECHA_ABIERTA, p_hasta: FECHA_ABIERTA })
      expect(notas, clave).toHaveLength(2)
      for (const nota of notas as Record<string, unknown>[]) expect(Object.keys(nota).sort()).toEqual(['cantidad', 'fecha', 'id', 'nota', 'tiempo_comida'])
      expect(notas).toContainEqual(expect.objectContaining({ cantidad: 2, nota: 'Sin sal' }))
      expect(JSON.stringify(notas)).not.toContain(ids.director)
    }

    const residente = await clienteComo('residente')
    expect((await residente.rpc('extras_de_la_semana', { p_desde: FECHA_ABIERTA, p_hasta: FECHA_ABIERTA })).data).toEqual([])
    expect((await residente.rpc('extras_manuales_de_la_semana', { p_desde: FECHA_ABIERTA, p_hasta: FECHA_ABIERTA })).data).toEqual([])
    const cocina = await clienteComo('administracion')
    expect((await cocina.from('extras_manuales').select('id')).data).toEqual([])
  })

  it('una comida que ya cerró acepta un extra de último momento, pero ya no se quita', async () => {
    // El desayuno de hoy cierra la noche anterior: con las horas por defecto ya cerró.
    const director = await clienteComo('director')
    const { data, error } = await director.from('extras_manuales').insert({ fecha: HOY, tiempo_comida: 'desayuno', cantidad: 1 }).select('id').single()
    expect(error).toBeNull()
    expect((await director.from('extras_manuales').delete().eq('id', data!.id).select('id')).data).toEqual([])
  })

  it('el Director los quita; un residente no', async () => {
    const director = await clienteComo('director')
    const { data } = await director.from('extras_manuales').insert({ fecha: FECHA_ABIERTA, tiempo_comida: 'almuerzo', cantidad: 4 }).select('id').single()
    const residente = await clienteComo('residente')
    expect((await residente.from('extras_manuales').delete().eq('id', data!.id).select('id')).data).toEqual([])
    expect((await director.from('extras_manuales').delete().eq('id', data!.id).select('id')).data).toEqual([{ id: data!.id }])
  })
})
