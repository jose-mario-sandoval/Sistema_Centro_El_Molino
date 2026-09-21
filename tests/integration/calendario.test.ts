import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

let ids: Record<ClaveUsuario, string>
const admin = clienteAdminPrueba()

const FECHA = '2026-10-07'
const SIN_PERMISO = ['residente', 'administracion'] as const

beforeAll(async () => {
  ids = await asegurarUsuariosPrueba()
})

afterEach(async () => {
  const { error } = await admin.from('eventos').delete().in('creado_por', Object.values(ids))
  if (error) throw error
  await asegurarUsuariosPrueba()
})

/** Crea un evento con la llave secreta (sin RLS) a nombre del usuario indicado. */
async function crearEventoDePrueba(autor: ClaveUsuario = 'director') {
  const { data, error } = await admin
    .from('eventos')
    .insert({ titulo: 'Evento de prueba', fecha: FECHA, hora: '19:30', creado_por: ids[autor] })
    .select('id, titulo, creado_por, creado_en, actualizado_en')
    .single()
  if (error) throw error
  return data
}

describe('eventos: lectura', () => {
  it.each(['director', 'residente'] as const)('%s ve los eventos', async (clave) => {
    const evento = await crearEventoDePrueba()
    const cliente = await clienteComo(clave)
    const { data, error } = await cliente.from('eventos').select('id, titulo, fecha, hora').eq('id', evento.id)
    expect(error).toBeNull()
    expect(data).toEqual([{ id: evento.id, titulo: 'Evento de prueba', fecha: FECHA, hora: '19:30:00' }])
  })

  it('Administración no lee la tabla: la base no le devuelve ninguna fila', async () => {
    await crearEventoDePrueba()
    const cliente = await clienteComo('administracion')
    const { data, error } = await cliente.from('eventos').select('id, titulo, fecha, hora')
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it('anon (sin sesión) no puede leer eventos', async () => {
    await crearEventoDePrueba()
    // clienteAdminPrueba ya exigió la base local; este cliente usa la llave pública sin iniciar sesión.
    const anonimo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await anonimo.from('eventos').select('id')
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })

  it('un usuario inactivo no ve eventos', async () => {
    await crearEventoDePrueba()
    await admin.from('perfiles').update({ activo: false }).eq('id', ids.residente2)
    const inactivo = await clienteComo('residente2')
    const { data } = await inactivo.from('eventos').select('id')
    expect(data).toEqual([])
  })
})

describe('eventos: Residente y Administración solo leen', () => {
  it.each(SIN_PERMISO)('%s no puede crear', async (clave) => {
    const cliente = await clienteComo(clave)
    const { error } = await cliente.from('eventos').insert({ titulo: 'No permitido', fecha: FECHA, creado_por: ids[clave] })
    expect(error?.code).toBe('42501')
  })

  it.each(SIN_PERMISO)('%s no puede editar', async (clave) => {
    const evento = await crearEventoDePrueba()
    const cliente = await clienteComo(clave)
    await cliente.from('eventos').update({ titulo: 'Cambiado' }).eq('id', evento.id)
    const { data } = await admin.from('eventos').select('titulo').eq('id', evento.id).single()
    expect(data!.titulo).toBe('Evento de prueba')
  })

  it.each(SIN_PERMISO)('%s no puede eliminar', async (clave) => {
    const evento = await crearEventoDePrueba()
    const cliente = await clienteComo(clave)
    await cliente.from('eventos').delete().eq('id', evento.id)
    const { data } = await admin.from('eventos').select('id').eq('id', evento.id)
    expect(data).toHaveLength(1)
  })
})

describe('eventos: el Director', () => {
  it('crea un evento a su nombre', async () => {
    const director = await clienteComo('director')
    const { data, error } = await director
      .from('eventos')
      .insert({ titulo: 'Charla formativa', fecha: FECHA, hora: null, creado_por: ids.director })
      .select('titulo, fecha, hora, creado_por')
      .single()
    expect(error).toBeNull()
    expect(data).toEqual({ titulo: 'Charla formativa', fecha: FECHA, hora: null, creado_por: ids.director })
  })

  it('no puede crear un evento a nombre de otra persona', async () => {
    const director = await clienteComo('director')
    const { error } = await director.from('eventos').insert({ titulo: 'Suplantado', fecha: FECHA, creado_por: ids.director2 })
    expect(error?.code).toBe('42501')
  })

  it('edita un evento de otro Director: actualizado_en cambia y creado_por/creado_en se conservan', async () => {
    const evento = await crearEventoDePrueba('director2')
    await new Promise((resolver) => setTimeout(resolver, 20))
    const director = await clienteComo('director')
    const { data, error } = await director
      .from('eventos')
      .update({ titulo: 'Evento editado', fecha: '2026-10-08', hora: '20:00' })
      .eq('id', evento.id)
      .select('titulo, fecha, hora, creado_por, creado_en, actualizado_en')
      .single()
    expect(error).toBeNull()
    expect(data).toMatchObject({
      titulo: 'Evento editado',
      fecha: '2026-10-08',
      hora: '20:00:00',
      creado_por: ids.director2,
      creado_en: evento.creado_en,
    })
    // El trigger fija actualizado_en aunque el Director no tenga UPDATE sobre esa columna.
    expect(new Date(data!.actualizado_en).getTime()).toBeGreaterThan(new Date(evento.actualizado_en).getTime())
  })

  it.each([
    ['creado_por', () => ({ creado_por: ids.director })],
    ['creado_en', () => ({ creado_en: '2000-01-01T00:00:00Z' })],
    ['actualizado_en', () => ({ actualizado_en: '2000-01-01T00:00:00Z' })],
  ])('no tiene privilegio para cambiar %s', async (_columna, cambio) => {
    const evento = await crearEventoDePrueba('director2')
    const director = await clienteComo('director')
    const { error } = await director
      .from('eventos')
      .update({ titulo: 'Evento editado', ...cambio() })
      .eq('id', evento.id)
    expect(error?.code).toBe('42501')
    const { data } = await admin.from('eventos').select('titulo, creado_por, creado_en').eq('id', evento.id).single()
    expect(data).toEqual({ titulo: 'Evento de prueba', creado_por: ids.director2, creado_en: evento.creado_en })
  })

  it('elimina un evento', async () => {
    const evento = await crearEventoDePrueba('director2')
    const director = await clienteComo('director')
    const { data, error } = await director.from('eventos').delete().eq('id', evento.id).select('id')
    expect(error).toBeNull()
    expect(data).toEqual([{ id: evento.id }])
  })

  it('un Director inactivo no puede crear', async () => {
    await admin.from('perfiles').update({ activo: false }).eq('id', ids.director2)
    const inactivo = await clienteComo('director2')
    const { error } = await inactivo.from('eventos').insert({ titulo: 'Inactivo', fecha: FECHA, creado_por: ids.director2 })
    expect(error?.code).toBe('42501')
  })

  it('un Director inactivo no puede editar', async () => {
    const evento = await crearEventoDePrueba('director2')
    await admin.from('perfiles').update({ activo: false }).eq('id', ids.director2)
    const inactivo = await clienteComo('director2')
    // RLS no da error: filtra las filas y no cambia ninguna.
    await inactivo.from('eventos').update({ titulo: 'Cambiado' }).eq('id', evento.id)
    const { data } = await admin.from('eventos').select('titulo').eq('id', evento.id).single()
    expect(data!.titulo).toBe('Evento de prueba')
  })

  it('un Director inactivo no puede eliminar', async () => {
    const evento = await crearEventoDePrueba('director2')
    await admin.from('perfiles').update({ activo: false }).eq('id', ids.director2)
    const inactivo = await clienteComo('director2')
    await inactivo.from('eventos').delete().eq('id', evento.id)
    const { data } = await admin.from('eventos').select('id').eq('id', evento.id)
    expect(data).toHaveLength(1)
  })
})

describe('eventos: integridad', () => {
  it.each([
    ['vacío', ''],
    ['de solo espacios', '   '],
    ['con espacios al inicio o al final', ' Charla '],
    ['de 121 caracteres', 'x'.repeat(121)],
  ])('rechaza un título %s', async (_caso, titulo) => {
    const { error } = await admin.from('eventos').insert({ titulo, fecha: FECHA, creado_por: ids.director })
    expect(error?.code).toBe('23514')
  })

  it.each(['1999-12-31', '2100-01-01'])('el Director no puede crear un evento con fecha %s (fuera de rango)', async (fecha) => {
    const director = await clienteComo('director')
    const { error } = await director.from('eventos').insert({ titulo: 'Fuera de rango', fecha, creado_por: ids.director })
    expect(error?.code).toBe('23514')
  })

  it('acepta las fechas límite 2000-01-01 y 2099-12-31', async () => {
    const { error } = await admin.from('eventos').insert([
      { titulo: 'Primer día', fecha: '2000-01-01', creado_por: ids.director },
      { titulo: 'Último día', fecha: '2099-12-31', creado_por: ids.director },
    ])
    expect(error).toBeNull()
  })

  it('acepta un título de 120 caracteres y una fecha sin hora', async () => {
    const { error } = await admin.from('eventos').insert({ titulo: 'x'.repeat(120), fecha: FECHA, creado_por: ids.director })
    expect(error).toBeNull()
  })

  it('creado_en y actualizado_en los pone la base al crear', async () => {
    const director = await clienteComo('director')
    const { data, error } = await director
      .from('eventos')
      .insert({
        titulo: 'Con marcas',
        fecha: FECHA,
        creado_por: ids.director,
        creado_en: '2000-01-01T00:00:00Z',
        actualizado_en: '2000-01-01T00:00:00Z',
      })
      .select('creado_en, actualizado_en')
      .single()
    expect(error).toBeNull()
    expect(new Date(data!.creado_en).getFullYear()).toBeGreaterThan(2000)
    expect(new Date(data!.actualizado_en).getFullYear()).toBeGreaterThan(2000)
  })
})

describe('eventos: tipo y pedidos a la cocina', () => {
  const base = () => ({ titulo: 'Evento de prueba', fecha: FECHA, creado_por: ids.director })

  it('sin indicarlos, un evento queda de tipo "otro" y sin pedidos a la cocina', async () => {
    const { data, error } = await admin.from('eventos').insert(base()).select('tipo, requiere_cocina').single()
    expect(error).toBeNull()
    expect(data).toEqual({ tipo: 'otro', requiere_cocina: [] })
  })

  it.each([[['merienda']], [['comida']], [['materiales']], [['merienda', 'comida']]])(
    'acepta pedir %j',
    async (requiere_cocina) => {
      const { error } = await admin.from('eventos').insert({ ...base(), tipo: 'retiro', requiere_cocina })
      expect(error).toBeNull()
    },
  )

  it.each([
    ['repetidos', ['comida', 'comida']],
    ['"solo materiales" junto a merienda', ['materiales', 'merienda']],
    ['"solo materiales" junto a comida', ['comida', 'materiales']],
  ])('la base rechaza %s', async (_caso, requiere_cocina) => {
    const { error } = await admin.from('eventos').insert({ ...base(), requiere_cocina })
    expect(error?.code).toBe('23514')
  })

  it('la base rechaza un tipo desconocido', async () => {
    const { error } = await admin.from('eventos').insert({ ...base(), tipo: 'fiesta' })
    expect(error?.code).toBe('22P02')
  })

  it('el Director cambia el tipo y lo que pide a la cocina', async () => {
    const evento = await crearEventoDePrueba()
    const director = await clienteComo('director')
    const { error } = await director
      .from('eventos')
      .update({ tipo: 'visita', requiere_cocina: ['merienda'] })
      .eq('id', evento.id)
    expect(error).toBeNull()
    const { data } = await admin.from('eventos').select('tipo, requiere_cocina').eq('id', evento.id).single()
    expect(data).toEqual({ tipo: 'visita', requiere_cocina: ['merienda'] })
  })

  it.each(SIN_PERMISO)('%s no puede cambiar el tipo ni lo que pide a la cocina', async (clave) => {
    const evento = await crearEventoDePrueba()
    const cliente = await clienteComo(clave)
    await cliente.from('eventos').update({ tipo: 'retiro', requiere_cocina: ['comida'] }).eq('id', evento.id)
    const { data } = await admin.from('eventos').select('tipo, requiere_cocina').eq('id', evento.id).single()
    expect(data).toEqual({ tipo: 'otro', requiere_cocina: [] })
  })
})

describe('eventos_para_cocina: lo único que Administración ve de los eventos', () => {
  async function sembrar() {
    const { error } = await admin.from('eventos').insert([
      { titulo: 'Retiro secreto', fecha: FECHA, hora: '16:00', tipo: 'retiro', requiere_cocina: ['merienda', 'comida'], creado_por: ids.director },
      { titulo: 'Reunión privada', fecha: FECHA, hora: '09:00', tipo: 'reunion', requiere_cocina: [], creado_por: ids.director },
      { titulo: 'Otro día', fecha: '2026-10-20', hora: null, tipo: 'visita', requiere_cocina: ['materiales'], creado_por: ids.director },
    ])
    if (error) throw error
  }

  it('devuelve solo los eventos que piden algo, con fecha, hora y qué preparar; sin título ni tipo', async () => {
    await sembrar()
    const cocina = await clienteComo('administracion')
    const { data, error } = await cocina.rpc('eventos_para_cocina', { p_desde: FECHA, p_hasta: FECHA })
    expect(error).toBeNull()
    expect(data).toEqual([{ id: expect.any(String), fecha: FECHA, hora: '16:00:00', requiere_cocina: ['merienda', 'comida'] }])
    expect(JSON.stringify(data)).not.toMatch(/secreto|privada|retiro|reunion/i)
  })

  it('respeta el rango de fechas y ordena por fecha y hora', async () => {
    await sembrar()
    const cocina = await clienteComo('administracion')
    const { data } = await cocina.rpc('eventos_para_cocina', { p_desde: '2026-10-01', p_hasta: '2026-10-31' })
    expect(data!.map((e: { fecha: string }) => e.fecha)).toEqual([FECHA, '2026-10-20'])
  })

  it('un usuario inactivo no obtiene nada', async () => {
    await sembrar()
    await admin.from('perfiles').update({ activo: false }).eq('id', ids.residente2)
    const inactivo = await clienteComo('residente2')
    const { data } = await inactivo.rpc('eventos_para_cocina', { p_desde: FECHA, p_hasta: FECHA })
    expect(data).toEqual([])
  })

  it('sin sesión no se puede llamar', async () => {
    await sembrar()
    const anonimo = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await anonimo.rpc('eventos_para_cocina', { p_desde: FECHA, p_hasta: FECHA })
    expect(error?.code).toBe('42501')
    expect(data).toBeNull()
  })
})
