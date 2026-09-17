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
  it.each(['director', 'residente', 'administracion'] as const)('%s ve los eventos', async (clave) => {
    const evento = await crearEventoDePrueba()
    const cliente = await clienteComo(clave)
    const { data, error } = await cliente.from('eventos').select('id, titulo, fecha, hora').eq('id', evento.id)
    expect(error).toBeNull()
    expect(data).toEqual([{ id: evento.id, titulo: 'Evento de prueba', fecha: FECHA, hora: '19:30:00' }])
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
