import { createClient } from '@supabase/supabase-js'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  clienteAnonimoPrueba,
  clienteComo,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'

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
      const { error } = await admin.from('eventos').insert({ ...base(), tipo: 'san_rafael', requiere_cocina })
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

  it.each(['retiro', 'charla', 'visita', 'reunion'])('ya no acepta el tipo viejo %s', async (tipo) => {
    const { error } = await admin.from('eventos').insert({ ...base(), tipo })
    expect(error?.code).toBe('22P02')
  })

  it.each(['san_rafael', 'san_gabriel', 'san_miguel', 'otro'])('acepta el tipo %s', async (tipo) => {
    const { error } = await admin.from('eventos').insert({ ...base(), tipo })
    expect(error).toBeNull()
  })

  it('el Director cambia el tipo y lo que pide a la cocina', async () => {
    const evento = await crearEventoDePrueba()
    const director = await clienteComo('director')
    const { error } = await director
      .from('eventos')
      .update({ tipo: 'san_gabriel', requiere_cocina: ['merienda'] })
      .eq('id', evento.id)
    expect(error).toBeNull()
    const { data } = await admin.from('eventos').select('tipo, requiere_cocina').eq('id', evento.id).single()
    expect(data).toEqual({ tipo: 'san_gabriel', requiere_cocina: ['merienda'] })
  })

  it.each(SIN_PERMISO)('%s no puede cambiar el tipo ni lo que pide a la cocina', async (clave) => {
    const evento = await crearEventoDePrueba()
    const cliente = await clienteComo(clave)
    await cliente.from('eventos').update({ tipo: 'san_rafael', requiere_cocina: ['comida'] }).eq('id', evento.id)
    const { data } = await admin.from('eventos').select('tipo, requiere_cocina').eq('id', evento.id).single()
    expect(data).toEqual({ tipo: 'otro', requiere_cocina: [] })
  })

  describe('eventos: pedido libre a Administración', () => {
    it('sin indicarlo, queda null', async () => {
      const { data, error } = await admin.from('eventos').insert(base()).select('requiere_otro_texto').single()
      expect(error).toBeNull()
      expect(data).toEqual({ requiere_otro_texto: null })
    })

    it('acepta un texto y lo combina con requiere_cocina (incluido materiales)', async () => {
      const { error } = await admin
        .from('eventos')
        .insert({ ...base(), requiere_cocina: ['materiales'], requiere_otro_texto: '20 sillas extra' })
      expect(error).toBeNull()
    })

    it.each([
      ['vacío', ''],
      ['solo espacios', '   '],
      ['sin recortar', '  20 sillas  '],
      ['más de 200 caracteres', 'x'.repeat(201)],
    ])('la base rechaza %s', async (_caso, requiere_otro_texto) => {
      const { error } = await admin.from('eventos').insert({ ...base(), requiere_otro_texto })
      expect(error?.code).toBe('23514')
    })

    it('el Director lo cambia; quien no tiene permiso no', async () => {
      const evento = await crearEventoDePrueba()
      const director = await clienteComo('director')
      const { error } = await director.from('eventos').update({ requiere_otro_texto: 'Traer termos' }).eq('id', evento.id)
      expect(error).toBeNull()

      const otroEvento = await crearEventoDePrueba()
      const residente = await clienteComo('residente')
      await residente.from('eventos').update({ requiere_otro_texto: 'Intento ajeno' }).eq('id', otroEvento.id)
      const { data } = await admin.from('eventos').select('requiere_otro_texto').eq('id', otroEvento.id).single()
      expect(data).toEqual({ requiere_otro_texto: null })
    })
  })
})

describe('eventos_para_cocina: lo único que Administración ve de los eventos', () => {
  async function sembrar() {
    const { error } = await admin.from('eventos').insert([
      { titulo: 'Retiro secreto', fecha: FECHA, hora: '16:00', tipo: 'san_rafael', requiere_cocina: ['merienda', 'comida'], creado_por: ids.director },
      { titulo: 'Reunión privada', fecha: FECHA, hora: '09:00', tipo: 'san_gabriel', requiere_cocina: [], creado_por: ids.director },
      { titulo: 'Otro día', fecha: '2026-10-20', hora: null, tipo: 'san_miguel', requiere_cocina: ['materiales'], creado_por: ids.director },
    ])
    if (error) throw error
  }

  it('devuelve solo los eventos que piden algo, con fecha, hora y qué preparar; sin título ni tipo', async () => {
    await sembrar()
    const cocina = await clienteComo('administracion')
    const { data, error } = await cocina.rpc('eventos_para_cocina', { p_desde: FECHA, p_hasta: FECHA })
    expect(error).toBeNull()
    expect(data).toEqual([
      { id: expect.any(String), fecha: FECHA, hora: '16:00:00', requiere_cocina: ['merienda', 'comida'], requiere_otro_texto: null },
    ])
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

  it('un evento que solo pide algo por texto libre también aparece', async () => {
    const { error } = await admin
      .from('eventos')
      .insert({ titulo: 'Visita con pedido especial', fecha: FECHA, hora: '11:00', requiere_cocina: [], requiere_otro_texto: '20 sillas extra', creado_por: ids.director })
    expect(error).toBeNull()
    const cocina = await clienteComo('administracion')
    const { data } = await cocina.rpc('eventos_para_cocina', { p_desde: FECHA, p_hasta: FECHA })
    expect(data).toEqual(
      expect.arrayContaining([expect.objectContaining({ requiere_cocina: [], requiere_otro_texto: '20 sillas extra' })]),
    )
  })
})

describe('enlaces_confirmacion: RLS y funciones públicas', () => {
  async function crearEnlaceDePrueba(vence: string = new Date(Date.now() + 3_600_000).toISOString()) {
    const evento = await crearEventoDePrueba()
    const { data, error } = await admin
      .from('enlaces_confirmacion')
      .insert({ evento_id: evento.id, tiempo_comida: 'cena', vence_en: vence, creado_por: ids.director })
      .select('id, token')
      .single()
    if (error) throw error
    return { ...data, eventoId: evento.id }
  }

  it('el Director crea un enlace; quien no tiene permiso no', async () => {
    const evento = await crearEventoDePrueba()
    const director = await clienteComo('director')
    const { error } = await director
      .from('enlaces_confirmacion')
      .insert({
        evento_id: evento.id,
        tiempo_comida: 'cena',
        vence_en: new Date(Date.now() + 3_600_000).toISOString(),
        creado_por: ids.director,
      })
    expect(error).toBeNull()

    for (const clave of SIN_PERMISO) {
      const cliente = await clienteComo(clave)
      const { error: errorAjeno } = await cliente
        .from('enlaces_confirmacion')
        .insert({ evento_id: evento.id, tiempo_comida: 'cena', vence_en: new Date(Date.now() + 3_600_000).toISOString() })
      expect(errorAjeno).not.toBeNull()
    }
  })

  it('rechaza un vencimiento en el pasado', async () => {
    const evento = await crearEventoDePrueba()
    const director = await clienteComo('director')
    const { error } = await director
      .from('enlaces_confirmacion')
      .insert({
        evento_id: evento.id,
        tiempo_comida: 'cena',
        vence_en: new Date(Date.now() - 3_600_000).toISOString(),
        creado_por: ids.director,
      })
    expect(error).not.toBeNull()
  })

  it('nadie lee enlaces_confirmacion ni confirmaciones_extra directo salvo el Director', async () => {
    const { id } = await crearEnlaceDePrueba()
    for (const clave of SIN_PERMISO) {
      const cliente = await clienteComo(clave)
      const { data } = await cliente.from('enlaces_confirmacion').select('id').eq('id', id)
      expect(data).toEqual([])
    }
    const anonimo = clienteAnonimoPrueba()
    const { data: dataAnonima, error: errorAnonimo } = await anonimo.from('enlaces_confirmacion').select('id')
    expect(errorAnonimo).not.toBeNull()
    expect(dataAnonima).toBeNull()
  })

  it('el Director adelanta el vencimiento', async () => {
    const { id } = await crearEnlaceDePrueba()
    const director = await clienteComo('director')
    const pasado = new Date(Date.now() - 1000).toISOString()
    const { error } = await director.from('enlaces_confirmacion').update({ vence_en: pasado }).eq('id', id)
    expect(error).toBeNull()
    const { data } = await admin.from('enlaces_confirmacion').select('vence_en').eq('id', id).single()
    // Postgres devuelve timestamptz como '...+00:00', no '...Z': mismo instante, otra notación.
    expect(new Date(data!.vence_en).toISOString()).toBe(pasado)
  })

  it.each(SIN_PERMISO)('%s no puede adelantar el vencimiento', async (clave) => {
    const { id } = await crearEnlaceDePrueba()
    const original = (await admin.from('enlaces_confirmacion').select('vence_en').eq('id', id).single()).data!.vence_en
    const cliente = await clienteComo(clave)
    await cliente.from('enlaces_confirmacion').update({ vence_en: new Date(Date.now() - 1000).toISOString() }).eq('id', id)
    const { data } = await admin.from('enlaces_confirmacion').select('vence_en').eq('id', id).single()
    expect(data!.vence_en).toBe(original)
  })

  describe('info_enlace_confirmacion', () => {
    it('devuelve los datos del evento y si sigue vigente, sin sesión', async () => {
      const { token } = await crearEnlaceDePrueba()
      const anonimo = clienteAnonimoPrueba()
      const { data, error } = await anonimo.rpc('info_enlace_confirmacion', { p_token: token }).single()
      expect(error).toBeNull()
      expect(data).toMatchObject({ tiempo_comida: 'cena', vigente: true })
    })

    it('un token que no existe no devuelve filas', async () => {
      const anonimo = clienteAnonimoPrueba()
      const { data, error } = await anonimo.rpc('info_enlace_confirmacion', { p_token: 'no-existe' })
      expect(error).toBeNull()
      expect(data).toEqual([])
    })

    it('un enlace vencido: vigente en false', async () => {
      const { token } = await crearEnlaceDePrueba(new Date(Date.now() - 1000).toISOString())
      const anonimo = clienteAnonimoPrueba()
      const { data } = await anonimo.rpc('info_enlace_confirmacion', { p_token: token }).single()
      // .single() sobre esta funcion no infiere bien el tipo de retorno (a diferencia del test de
      // arriba, que usa toMatchObject y no lo necesita): el runtime esta probado, esto es solo el tipo.
      expect((data as { vigente: boolean } | null)!.vigente).toBe(false)
    })
  })

  describe('confirmar_cena_extra', () => {
    it('una persona sin sesión confirma cena para ella y sus invitados', async () => {
      const { token, id } = await crearEnlaceDePrueba()
      const anonimo = clienteAnonimoPrueba()
      const { error } = await anonimo.rpc('confirmar_cena_extra', { p_token: token, p_nombre: 'Familia Pérez', p_cantidad: 3 })
      expect(error).toBeNull()
      const { data } = await admin.from('confirmaciones_extra').select('nombre, cantidad_personas').eq('enlace_id', id)
      expect(data).toEqual([{ nombre: 'Familia Pérez', cantidad_personas: 3 }])
    })

    it('rechaza confirmar en un enlace vencido, sin insertar', async () => {
      const { token, id } = await crearEnlaceDePrueba(new Date(Date.now() - 1000).toISOString())
      const anonimo = clienteAnonimoPrueba()
      const { error } = await anonimo.rpc('confirmar_cena_extra', { p_token: token, p_nombre: 'Tarde', p_cantidad: 1 })
      expect(error?.code).toBe('MOL05')
      const { data } = await admin.from('confirmaciones_extra').select('id').eq('enlace_id', id)
      expect(data).toEqual([])
    })

    it('rechaza un token que no existe', async () => {
      const anonimo = clienteAnonimoPrueba()
      const { error } = await anonimo.rpc('confirmar_cena_extra', { p_token: 'no-existe', p_nombre: 'X', p_cantidad: 1 })
      expect(error?.code).toBe('MOL05')
    })

    it('la base rechaza una cantidad fuera de rango', async () => {
      const { token } = await crearEnlaceDePrueba()
      const anonimo = clienteAnonimoPrueba()
      const { error } = await anonimo.rpc('confirmar_cena_extra', { p_token: token, p_nombre: 'X', p_cantidad: 11 })
      expect(error?.code).toBe('23514')
    })
  })
})

describe('enlaces_confirmacion: RLS y funciones públicas', () => {
  async function crearEnlaceDePrueba(vence: string = new Date(Date.now() + 3_600_000).toISOString()) {
    const evento = await crearEventoDePrueba()
    const { data, error } = await admin
      .from('enlaces_confirmacion')
      .insert({ evento_id: evento.id, tiempo_comida: 'cena', vence_en: vence, creado_por: ids.director })
      .select('id, token')
      .single()
    if (error) throw error
    return { ...data, eventoId: evento.id }
  }

  it('el Director crea un enlace; quien no tiene permiso no', async () => {
    const evento = await crearEventoDePrueba()
    const director = await clienteComo('director')
    const { error } = await director
      .from('enlaces_confirmacion')
      .insert({
        evento_id: evento.id,
        tiempo_comida: 'cena',
        vence_en: new Date(Date.now() + 3_600_000).toISOString(),
        creado_por: ids.director,
      })
    expect(error).toBeNull()

    for (const clave of SIN_PERMISO) {
      const cliente = await clienteComo(clave)
      const { error: errorAjeno } = await cliente
        .from('enlaces_confirmacion')
        .insert({ evento_id: evento.id, tiempo_comida: 'cena', vence_en: new Date(Date.now() + 3_600_000).toISOString() })
      expect(errorAjeno).not.toBeNull()
    }
  })

  it('rechaza un vencimiento en el pasado', async () => {
    const evento = await crearEventoDePrueba()
    const director = await clienteComo('director')
    const { error } = await director
      .from('enlaces_confirmacion')
      .insert({
        evento_id: evento.id,
        tiempo_comida: 'cena',
        vence_en: new Date(Date.now() - 3_600_000).toISOString(),
        creado_por: ids.director,
      })
    expect(error).not.toBeNull()
  })

  it('nadie lee enlaces_confirmacion ni confirmaciones_extra directo salvo el Director', async () => {
    const { id } = await crearEnlaceDePrueba()
    for (const clave of SIN_PERMISO) {
      const cliente = await clienteComo(clave)
      const { data } = await cliente.from('enlaces_confirmacion').select('id').eq('id', id)
      expect(data).toEqual([])
    }
    const anonimo = clienteAnonimoPrueba()
    const { data: dataAnonima, error: errorAnonimo } = await anonimo.from('enlaces_confirmacion').select('id')
    expect(errorAnonimo).not.toBeNull()
    expect(dataAnonima).toBeNull()
  })

  it('el Director adelanta el vencimiento', async () => {
    const { id } = await crearEnlaceDePrueba()
    const director = await clienteComo('director')
    const pasado = new Date(Date.now() - 1000).toISOString()
    const { error } = await director.from('enlaces_confirmacion').update({ vence_en: pasado }).eq('id', id)
    expect(error).toBeNull()
    const { data } = await admin.from('enlaces_confirmacion').select('vence_en').eq('id', id).single()
    // Postgres devuelve timestamptz como '...+00:00', no '...Z': mismo instante, otra notación.
    expect(new Date(data!.vence_en).toISOString()).toBe(pasado)
  })

  it.each(SIN_PERMISO)('%s no puede adelantar el vencimiento', async (clave) => {
    const { id } = await crearEnlaceDePrueba()
    const original = (await admin.from('enlaces_confirmacion').select('vence_en').eq('id', id).single()).data!.vence_en
    const cliente = await clienteComo(clave)
    await cliente.from('enlaces_confirmacion').update({ vence_en: new Date(Date.now() - 1000).toISOString() }).eq('id', id)
    const { data } = await admin.from('enlaces_confirmacion').select('vence_en').eq('id', id).single()
    expect(data!.vence_en).toBe(original)
  })

  describe('info_enlace_confirmacion', () => {
    it('devuelve los datos del evento y si sigue vigente, sin sesión', async () => {
      const { token } = await crearEnlaceDePrueba()
      const anonimo = clienteAnonimoPrueba()
      const { data, error } = await anonimo.rpc('info_enlace_confirmacion', { p_token: token }).single()
      expect(error).toBeNull()
      expect(data).toMatchObject({ tiempo_comida: 'cena', vigente: true })
    })

    it('un token que no existe no devuelve filas', async () => {
      const anonimo = clienteAnonimoPrueba()
      const { data, error } = await anonimo.rpc('info_enlace_confirmacion', { p_token: 'no-existe' })
      expect(error).toBeNull()
      expect(data).toEqual([])
    })

    it('un enlace vencido: vigente en false', async () => {
      const { token } = await crearEnlaceDePrueba(new Date(Date.now() - 1000).toISOString())
      const anonimo = clienteAnonimoPrueba()
      const { data } = await anonimo.rpc('info_enlace_confirmacion', { p_token: token }).single()
      expect(data!.vigente).toBe(false)
    })
  })

  describe('confirmar_cena_extra', () => {
    it('una persona sin sesión confirma cena para ella y sus invitados', async () => {
      const { token, id } = await crearEnlaceDePrueba()
      const anonimo = clienteAnonimoPrueba()
      const { error } = await anonimo.rpc('confirmar_cena_extra', { p_token: token, p_nombre: 'Familia Pérez', p_cantidad: 3 })
      expect(error).toBeNull()
      const { data } = await admin.from('confirmaciones_extra').select('nombre, cantidad_personas').eq('enlace_id', id)
      expect(data).toEqual([{ nombre: 'Familia Pérez', cantidad_personas: 3 }])
    })

    it('rechaza confirmar en un enlace vencido, sin insertar', async () => {
      const { token, id } = await crearEnlaceDePrueba(new Date(Date.now() - 1000).toISOString())
      const anonimo = clienteAnonimoPrueba()
      const { error } = await anonimo.rpc('confirmar_cena_extra', { p_token: token, p_nombre: 'Tarde', p_cantidad: 1 })
      expect(error?.code).toBe('MOL05')
      const { data } = await admin.from('confirmaciones_extra').select('id').eq('enlace_id', id)
      expect(data).toEqual([])
    })

    it('rechaza un token que no existe', async () => {
      const anonimo = clienteAnonimoPrueba()
      const { error } = await anonimo.rpc('confirmar_cena_extra', { p_token: 'no-existe', p_nombre: 'X', p_cantidad: 1 })
      expect(error?.code).toBe('MOL05')
    })

    it('la base rechaza una cantidad fuera de rango', async () => {
      const { token } = await crearEnlaceDePrueba()
      const anonimo = clienteAnonimoPrueba()
      const { error } = await anonimo.rpc('confirmar_cena_extra', { p_token: token, p_nombre: 'X', p_cantidad: 11 })
      expect(error?.code).toBe('23514')
    })
  })
})
