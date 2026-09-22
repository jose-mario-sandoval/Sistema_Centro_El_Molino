import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { consultarPaginaFeed } from '@/lib/mensajes/consulta-feed'
import { TAMANO_PAGINA } from '@/lib/mensajes/feed'
import type { Database } from '@/lib/supabase/database.types'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  clienteComo,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'

let ids: Record<ClaveUsuario, string>
const admin = clienteAdminPrueba()

beforeAll(async () => {
  ids = await asegurarUsuariosPrueba()
})

afterEach(async () => {
  const usuarios = Object.values(ids)
  // Con la llave secreta auth.uid() es nulo: no genera registro. Respuestas y reacciones caen en cascada.
  await admin.from('mensajes').delete().in('autor_id', usuarios)
  await admin.from('registro_moderacion').delete().in('autor_id', usuarios)
  // Reactiva a quien una prueba haya desactivado.
  await asegurarUsuariosPrueba()
})

/** Inserta un mensaje con la sesión de `clave` (RLS aplica) y devuelve su id. */
async function publicar(clave: ClaveUsuario, texto: string, padreId: string | null = null): Promise<string> {
  const cliente = await clienteComo(clave)
  const { data, error } = await cliente
    .from('mensajes')
    .insert({ autor_id: ids[clave], padre_id: padreId, texto })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

async function existe(id: string): Promise<boolean> {
  const { data, error } = await admin.from('mensajes').select('id').eq('id', id).maybeSingle()
  if (error) throw error
  return data !== null
}

async function registroCon(texto: string) {
  const { data, error } = await admin.from('registro_moderacion').select('*').eq('texto_eliminado', texto)
  if (error) throw error
  return data
}

async function contarReacciones(mensajeId: string): Promise<number> {
  const { count, error } = await admin
    .from('reacciones')
    .select('*', { count: 'exact', head: true })
    .eq('mensaje_id', mensajeId)
  if (error) throw error
  return count ?? 0
}

describe('mensajes: publicar y responder', () => {
  it('cada rol publica como sí mismo', async () => {
    for (const clave of ['director', 'residente', 'administracion'] as const) {
      const id = await publicar(clave, `Hola de ${clave}`)
      expect(await existe(id)).toBe(true)
    }
  })

  it('rechaza publicar con otro autor', async () => {
    const residente = await clienteComo('residente')
    const { error } = await residente.from('mensajes').insert({ autor_id: ids.director, texto: 'Suplantación' })
    expect(error?.code).toBe('42501')
  })

  it('acepta hasta 2000 caracteres y rechaza textos vacíos o más largos', async () => {
    const residente = await clienteComo('residente')
    for (const texto of ['', '   ', '\n\t \r\n']) {
      const vacio = await residente.from('mensajes').insert({ autor_id: ids.residente, texto })
      expect(vacio.error?.code).toBe('23514')
    }
    const largo = await residente.from('mensajes').insert({ autor_id: ids.residente, texto: 'a'.repeat(2001) })
    expect(largo.error?.code).toBe('23514')
    const justo = await residente.from('mensajes').insert({ autor_id: ids.residente, texto: 'a'.repeat(2000) })
    expect(justo.error).toBeNull()
  })

  it('responde a una publicación', async () => {
    const publicacion = await publicar('director', 'Publicación con respuesta')
    const respuesta = await publicar('residente', 'Respuesta', publicacion)
    const { data } = await admin.from('mensajes').select('padre_id').eq('id', respuesta).single()
    expect(data!.padre_id).toBe(publicacion)
  })

  it('con el id del navegador, repetir el envío choca con 23505 sin duplicar (base de la idempotencia)', async () => {
    const residente = await clienteComo('residente')
    const id = randomUUID()
    const fila = { id, autor_id: ids.residente, texto: 'Envío repetido' }
    expect((await residente.from('mensajes').insert(fila)).error).toBeNull()
    expect((await residente.from('mensajes').insert(fila)).error?.code).toBe('23505')

    const respuesta = { id: randomUUID(), autor_id: ids.residente, padre_id: id, texto: 'Respuesta repetida' }
    expect((await residente.from('mensajes').insert(respuesta)).error).toBeNull()
    expect((await residente.from('mensajes').insert(respuesta)).error?.code).toBe('23505')

    const { count } = await admin
      .from('mensajes')
      .select('*', { count: 'exact', head: true })
      .in('id', [id, respuesta.id])
    expect(count).toBe(2)
    // Lo que verifica la acción antes de tomar el 23505 como éxito: el mensaje es de quien envía.
    const { data } = await residente
      .from('mensajes')
      .select('id')
      .eq('id', id)
      .eq('autor_id', ids.residente)
      .is('padre_id', null)
    expect(data).toEqual([{ id }])
  })

  it('rechaza responder a una respuesta (MOL03)', async () => {
    const publicacion = await publicar('director', 'Publicación')
    const respuesta = await publicar('residente', 'Respuesta', publicacion)
    const residente2 = await clienteComo('residente2')
    const { error } = await residente2
      .from('mensajes')
      .insert({ autor_id: ids.residente2, padre_id: respuesta, texto: 'Respuesta a una respuesta' })
    expect(error?.code).toBe('MOL03')
  })
})

describe('reacciones', () => {
  it('permite una sola reacción por persona', async () => {
    const publicacion = await publicar('director', 'Para reaccionar')
    const residente = await clienteComo('residente')
    const primera = await residente.from('reacciones').insert({ mensaje_id: publicacion, usuario_id: ids.residente })
    expect(primera.error).toBeNull()
    const segunda = await residente.from('reacciones').insert({ mensaje_id: publicacion, usuario_id: ids.residente })
    expect(segunda.error?.code).toBe('23505')
    expect(await contarReacciones(publicacion)).toBe(1)
  })

  it('rechaza reaccionar en nombre de otra persona', async () => {
    const publicacion = await publicar('director', 'Reacción suplantada')
    const residente = await clienteComo('residente')
    const { error } = await residente.from('reacciones').insert({ mensaje_id: publicacion, usuario_id: ids.residente2 })
    expect(error?.code).toBe('42501')
  })

  it('rechaza reacciones en respuestas (MOL03)', async () => {
    const publicacion = await publicar('director', 'Publicación')
    const respuesta = await publicar('residente', 'Respuesta sin reacciones', publicacion)
    const residente2 = await clienteComo('residente2')
    const { error } = await residente2.from('reacciones').insert({ mensaje_id: respuesta, usuario_id: ids.residente2 })
    expect(error?.code).toBe('MOL03')
  })

  it('cada uno quita solo su propia reacción', async () => {
    const publicacion = await publicar('director', 'Reacciones ajenas')
    const residente = await clienteComo('residente')
    await residente.from('reacciones').insert({ mensaje_id: publicacion, usuario_id: ids.residente })

    const residente2 = await clienteComo('residente2')
    const ajena = await residente2
      .from('reacciones')
      .delete()
      .eq('mensaje_id', publicacion)
      .eq('usuario_id', ids.residente)
      .select()
    expect(ajena.error).toBeNull()
    expect(ajena.data).toEqual([])
    expect(await contarReacciones(publicacion)).toBe(1)

    const propia = await residente
      .from('reacciones')
      .delete()
      .eq('mensaje_id', publicacion)
      .eq('usuario_id', ids.residente)
      .select()
    expect(propia.data).toHaveLength(1)
  })
})

describe('borrado y registro de moderación', () => {
  it('el autor borra su mensaje y no queda registro', async () => {
    const id = await publicar('residente', 'Propio para borrar')
    const residente = await clienteComo('residente')
    const { data, error } = await residente.from('mensajes').delete().eq('id', id).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(await registroCon('Propio para borrar')).toEqual([])
  })

  it('un residente no puede borrar un mensaje ajeno', async () => {
    const id = await publicar('residente', 'Ajeno protegido')
    const residente2 = await clienteComo('residente2')
    const { data, error } = await residente2.from('mensajes').delete().eq('id', id).select('id')
    expect(error).toBeNull()
    expect(data).toEqual([])
    expect(await existe(id)).toBe(true)
  })

  it('administración no puede borrar un mensaje ajeno', async () => {
    const id = await publicar('residente', 'Ajeno para administración')
    const administracion = await clienteComo('administracion')
    const { data } = await administracion.from('mensajes').delete().eq('id', id).select('id')
    expect(data).toEqual([])
    expect(await existe(id)).toBe(true)
  })

  it('el Director borra un mensaje ajeno y queda en el registro con su texto', async () => {
    const id = await publicar('residente', 'Mensaje moderado')
    const director = await clienteComo('director')
    const { data, error } = await director.from('mensajes').delete().eq('id', id).select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)

    const registro = await registroCon('Mensaje moderado')
    expect(registro).toHaveLength(1)
    expect(registro[0]).toMatchObject({
      moderador_id: ids.director,
      autor_id: ids.residente,
      texto_eliminado: 'Mensaje moderado',
      era_respuesta: false,
    })
  })

  it('una respuesta ajena borrada por el Director queda registrada como respuesta', async () => {
    const publicacion = await publicar('director', 'Publicación del Director')
    const respuesta = await publicar('residente2', 'Respuesta moderada', publicacion)
    const director = await clienteComo('director')
    await director.from('mensajes').delete().eq('id', respuesta)

    expect(await existe(publicacion)).toBe(true)
    const registro = await registroCon('Respuesta moderada')
    expect(registro).toHaveLength(1)
    expect(registro[0]).toMatchObject({ autor_id: ids.residente2, era_respuesta: true })
  })

  it('el Director borra su propio mensaje sin dejar registro', async () => {
    const id = await publicar('director', 'Propio del Director')
    const director = await clienteComo('director')
    const { data } = await director.from('mensajes').delete().eq('id', id).select('id')
    expect(data).toHaveLength(1)
    expect(await registroCon('Propio del Director')).toEqual([])
  })

  it('borrar una publicación ajena borra respuestas y reacciones sin filas extra en el registro', async () => {
    const publicacion = await publicar('residente', 'Publicación en cascada')
    const ajena = await publicar('residente2', 'Respuesta ajena en cascada', publicacion)
    const delDirector = await publicar('director', 'Respuesta del Director en cascada', publicacion)
    const administracion = await clienteComo('administracion')
    await administracion.from('reacciones').insert({ mensaje_id: publicacion, usuario_id: ids.administracion })

    const director = await clienteComo('director')
    await director.from('mensajes').delete().eq('id', publicacion)

    expect(await existe(ajena)).toBe(false)
    expect(await existe(delDirector)).toBe(false)
    expect(await contarReacciones(publicacion)).toBe(0)
    expect(await registroCon('Publicación en cascada')).toHaveLength(1)
    expect(await registroCon('Respuesta ajena en cascada')).toEqual([])
    expect(await registroCon('Respuesta del Director en cascada')).toEqual([])
  })

  it('el autor borra su publicación con respuestas ajenas sin generar registro', async () => {
    const publicacion = await publicar('residente', 'Propia con respuestas')
    await publicar('residente2', 'Respuesta ajena que cae en cascada', publicacion)
    const residente = await clienteComo('residente')
    const { data } = await residente.from('mensajes').delete().eq('id', publicacion).select('id')
    expect(data).toHaveLength(1)
    expect(await registroCon('Propia con respuestas')).toEqual([])
    expect(await registroCon('Respuesta ajena que cae en cascada')).toEqual([])
  })
})

describe('registro_moderacion: RLS', () => {
  async function moderar(texto: string) {
    const id = await publicar('residente', texto)
    const director = await clienteComo('director')
    await director.from('mensajes').delete().eq('id', id)
  }

  it('el Director lo lee', async () => {
    await moderar('Visible para el Director')
    const director = await clienteComo('director')
    const { data, error } = await director
      .from('registro_moderacion')
      .select('texto_eliminado')
      .eq('texto_eliminado', 'Visible para el Director')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('residente y administración no lo ven', async () => {
    await moderar('Invisible para otros roles')
    for (const clave of ['residente', 'administracion'] as const) {
      const cliente = await clienteComo(clave)
      const { data, error } = await cliente.from('registro_moderacion').select('id')
      expect(error).toBeNull()
      expect(data).toEqual([])
    }
  })

  it('nadie escribe ni borra directamente en el registro', async () => {
    await moderar('Registro protegido')
    const director = await clienteComo('director')
    const insercion = await director.from('registro_moderacion').insert({
      moderador_id: ids.director,
      autor_id: ids.residente,
      texto_eliminado: 'Entrada falsa',
      era_respuesta: false,
    })
    expect(insercion.error?.code).toBe('42501')

    const borrado = await director
      .from('registro_moderacion')
      .delete()
      .eq('texto_eliminado', 'Registro protegido')
      .select('id')
    expect(borrado.error?.code).toBe('42501')
    expect(await registroCon('Registro protegido')).toHaveLength(1)
  })
})

describe('consulta del feed', () => {
  /** La consulta de la app con la sesión de `clave` (RLS aplica). */
  async function paginaComo(clave: ClaveUsuario, antesDe: string | null = null) {
    const cliente = (await clienteComo(clave)) as unknown as SupabaseClient<Database>
    return consultarPaginaFeed(cliente, antesDe)
  }

  it('trae cada publicación con sus respuestas y reacciones embebidas', async () => {
    const conTodo = await publicar('director', 'Feed con respuestas y reacciones')
    const primera = await publicar('residente', 'Primera respuesta', conTodo)
    const segunda = await publicar('residente2', 'Segunda respuesta', conTodo)
    const sola = await publicar('residente', 'Feed sin nada')
    for (const clave of ['residente', 'residente2', 'administracion'] as const) {
      const cliente = await clienteComo(clave)
      const { error } = await cliente.from('reacciones').insert({ mensaje_id: conTodo, usuario_id: ids[clave] })
      expect(error).toBeNull()
    }

    const { publicaciones } = await paginaComo('residente')
    // Las respuestas no aparecen como publicaciones.
    expect(publicaciones.map((p) => p.id)).not.toContain(primera)

    const p = publicaciones.find((x) => x.id === conTodo)!
    expect(p).toMatchObject({ autorId: ids.director, texto: 'Feed con respuestas y reacciones' })
    expect(p.reacciones).toHaveLength(3)
    expect([...p.reacciones].sort()).toEqual([ids.residente, ids.residente2, ids.administracion].sort())
    expect(p.respuestas.map((r) => [r.id, r.autorId, r.texto])).toEqual([
      [primera, ids.residente, 'Primera respuesta'],
      [segunda, ids.residente2, 'Segunda respuesta'],
    ])

    const vacia = publicaciones.find((x) => x.id === sola)!
    expect(vacia.reacciones).toEqual([])
    expect(vacia.respuestas).toEqual([])
  })

  it('trae todas las respuestas aunque una publicación pase de max_rows (1000) o la página entera lo supere', async () => {
    // PostgREST corta cada lista embebida en max_rows: la de 1001 se completa aparte. La de 600 muestra que
    // el corte es por publicación y no sobre el total embebido de la página (1601).
    const conMuchas = await publicar('director', 'Publicación con 1001 respuestas')
    const conVarias = await publicar('residente', 'Publicación con 600 respuestas')
    const respuestas = (padreId: string, cantidad: number) =>
      Array.from({ length: cantidad }, (_, i) => ({
        id: randomUUID(),
        autor_id: i % 2 === 0 ? ids.residente : ids.residente2,
        padre_id: padreId,
        texto: `Respuesta masiva ${i}`,
      }))
    const deMuchas = respuestas(conMuchas, 1001)
    const deVarias = respuestas(conVarias, 600)
    try {
      // Una sola inserción en lote con la llave secreta; todas quedan con el mismo creado_en.
      const { error } = await admin.from('mensajes').insert([...deMuchas, ...deVarias])
      expect(error).toBeNull()

      const { publicaciones } = await paginaComo('residente')
      const idsDe = (id: string) => publicaciones.find((p) => p.id === id)?.respuestas.map((r) => r.id)
      expect(idsDe(conMuchas)).toHaveLength(1001)
      expect(new Set(idsDe(conMuchas))).toEqual(new Set(deMuchas.map((r) => r.id)))
      expect(idsDe(conVarias)).toHaveLength(600)
      expect(new Set(idsDe(conVarias))).toEqual(new Set(deVarias.map((r) => r.id)))
    } finally {
      // Las respuestas caen en cascada (afterEach también limpia, pero así no depende de él).
      await admin.from('mensajes').delete().in('id', [conMuchas, conVarias])
    }
  })

  it('pagina de a TAMANO_PAGINA con cursor, sin repetir ni saltear, aunque solo difieran los microsegundos', async () => {
    // Todas en el mismo milisegundo (.123), distintas solo en los microsegundos: el cursor y el orden tienen
    // que compararlos, porque Date no los ve.
    const creadoEn = (i: number) => `2026-01-01T12:00:00.123${String(456 + i).padStart(3, '0')}+00:00`
    const filas = Array.from({ length: TAMANO_PAGINA + 2 }, (_, i) => ({
      id: randomUUID(),
      autor_id: ids.director,
      texto: `Paginación ${i}`,
      creado_en: creadoEn(i),
    }))
    const { error } = await admin.from('mensajes').insert(filas)
    expect(error).toBeNull()
    const nuevas = new Set<string>(filas.map((f) => f.id))
    // De la más nueva (.123507) a la más antigua (.123456).
    const esperadas = filas.map((f) => f.id).reverse()

    const primera = await paginaComo('administracion')
    expect(primera.publicaciones).toHaveLength(TAMANO_PAGINA)
    expect(primera.hayMas).toBe(true)

    const cursor = primera.publicaciones.at(-1)!.creadoEn
    // La más antigua de la primera página es la número 50 desde la más nueva, no una cualquiera del milisegundo.
    expect(cursor).toMatch(/^2026-01-01T12:00:00\.123458/)
    const segunda = await paginaComo('administracion', cursor)

    const vistas = [...primera.publicaciones, ...segunda.publicaciones].map((p) => p.id)
    expect(new Set(vistas).size).toBe(vistas.length)
    expect(vistas.filter((id) => nuevas.has(id))).toEqual(esperadas)
  })
})

describe('usuario inactivo', () => {
  it('no lee mensajes ni reacciones y no puede publicar', async () => {
    const publicacion = await publicar('director', 'Solo para activos')
    await admin.from('reacciones').insert({ mensaje_id: publicacion, usuario_id: ids.director })
    await admin.from('perfiles').update({ activo: false }).eq('id', ids.residente2)

    const inactivo = await clienteComo('residente2')
    const mensajes = await inactivo.from('mensajes').select('id')
    expect(mensajes.data).toEqual([])
    const reacciones = await inactivo.from('reacciones').select('mensaje_id')
    expect(reacciones.data).toEqual([])
    const { error } = await inactivo.from('mensajes').insert({ autor_id: ids.residente2, texto: 'No debería publicarse' })
    expect(error?.code).toBe('42501')
  })
})

describe('aprobación de mensajes', () => {
  async function mensajeDeResidente() {
    const { data, error } = await admin
      .from('mensajes')
      .insert({ autor_id: ids.residente, texto: 'Mensaje de prueba' })
      .select('id, estado')
      .single()
    if (error) throw error
    return data
  }

  it('un Residente publica y queda pendiente; el Director publica y queda aprobado', async () => {
    const residente = await clienteComo('residente')
    const { data: propio } = await residente.from('mensajes').insert({ autor_id: ids.residente, texto: 'Hola' }).select('estado').single()
    expect(propio!.estado).toBe('pendiente')

    const director = await clienteComo('director')
    const { data: delDirector } = await director.from('mensajes').insert({ autor_id: ids.director, texto: 'Aviso' }).select('estado').single()
    expect(delDirector!.estado).toBe('aprobado')
  })

  it('el cliente no puede autoaprobarse mandando estado en el insert', async () => {
    const residente = await clienteComo('residente')
    const { data } = await residente
      .from('mensajes')
      // @ts-expect-error -- estado no debería poder mandarse, pero probamos que aunque se intente, no sirve.
      .insert({ autor_id: ids.residente, texto: 'Truco', estado: 'aprobado' })
      .select('estado')
      .single()
    expect(data!.estado).toBe('pendiente')
  })

  it('quien no es el autor ni el Director no ve un mensaje pendiente', async () => {
    const mensaje = await mensajeDeResidente()
    const otroResidente = await clienteComo('residente2')
    const { data } = await otroResidente.from('mensajes').select('id').eq('id', mensaje.id)
    expect(data).toEqual([])
  })

  it('el autor sí ve su propio mensaje pendiente; el Director también', async () => {
    const mensaje = await mensajeDeResidente()
    const residente = await clienteComo('residente')
    const { data: propio } = await residente.from('mensajes').select('id').eq('id', mensaje.id)
    expect(propio).toEqual([{ id: mensaje.id }])
    const director = await clienteComo('director')
    const { data: delDirector } = await director.from('mensajes').select('id').eq('id', mensaje.id)
    expect(delDirector).toEqual([{ id: mensaje.id }])
  })

  it('el Director aprueba, edita el texto y pone un mensaje en rechazado con motivo', async () => {
    const mensaje = await mensajeDeResidente()
    const director = await clienteComo('director')
    const { error } = await director.from('mensajes').update({ estado: 'aprobado', texto: 'Corregido por el Director' }).eq('id', mensaje.id)
    expect(error).toBeNull()
    const { data } = await admin.from('mensajes').select('estado, texto').eq('id', mensaje.id).single()
    expect(data).toEqual({ estado: 'aprobado', texto: 'Corregido por el Director' })

    const otro = await mensajeDeResidente()
    await director.from('mensajes').update({ estado: 'rechazado', motivo_rechazo: 'Muy largo' }).eq('id', otro.id)
    const { data: rechazado } = await admin.from('mensajes').select('estado, motivo_rechazo').eq('id', otro.id).single()
    expect(rechazado).toEqual({ estado: 'rechazado', motivo_rechazo: 'Muy largo' })
  })

  it('una vez aprobado, todos lo ven', async () => {
    const mensaje = await mensajeDeResidente()
    const director = await clienteComo('director')
    await director.from('mensajes').update({ estado: 'aprobado' }).eq('id', mensaje.id)
    const otroResidente = await clienteComo('residente2')
    const { data } = await otroResidente.from('mensajes').select('id').eq('id', mensaje.id)
    expect(data).toEqual([{ id: mensaje.id }])
  })

  it('el autor corrige un mensaje rechazado y vuelve a pendiente automáticamente', async () => {
    const mensaje = await mensajeDeResidente()
    const director = await clienteComo('director')
    await director.from('mensajes').update({ estado: 'rechazado', motivo_rechazo: 'Corregí esto' }).eq('id', mensaje.id)

    const residente = await clienteComo('residente')
    const { error } = await residente.from('mensajes').update({ texto: 'Ya corregido' }).eq('id', mensaje.id)
    expect(error).toBeNull()
    const { data } = await admin.from('mensajes').select('estado, texto, motivo_rechazo').eq('id', mensaje.id).single()
    expect(data).toEqual({ estado: 'pendiente', texto: 'Ya corregido', motivo_rechazo: null })
  })

  it('el autor no puede editar un mensaje pendiente ni uno aprobado (sin pasar por rechazado)', async () => {
    const mensaje = await mensajeDeResidente() // pendiente
    const residente = await clienteComo('residente')
    const { data: sinTocarPendiente } = await residente.from('mensajes').update({ texto: 'Intento' }).eq('id', mensaje.id).select('id')
    expect(sinTocarPendiente).toEqual([])

    const director = await clienteComo('director')
    await director.from('mensajes').update({ estado: 'aprobado' }).eq('id', mensaje.id)
    const { data: sinTocarAprobado } = await residente.from('mensajes').update({ texto: 'Intento 2' }).eq('id', mensaje.id).select('id')
    expect(sinTocarAprobado).toEqual([])
  })

  it('quien no es el autor ni el Director no puede editar nada', async () => {
    const mensaje = await mensajeDeResidente()
    const director = await clienteComo('director')
    await director.from('mensajes').update({ estado: 'rechazado' }).eq('id', mensaje.id)
    const otroResidente = await clienteComo('residente2')
    const { data } = await otroResidente.from('mensajes').update({ texto: 'Ajeno' }).eq('id', mensaje.id).select('id')
    expect(data).toEqual([])
  })

  it('una reacción a un mensaje pendiente no es visible para terceros', async () => {
    const mensaje = await mensajeDeResidente()
    const { error: errorReaccion } = await admin.from('reacciones').insert({ mensaje_id: mensaje.id, usuario_id: ids.director })
    expect(errorReaccion).toBeNull()
    const otroResidente = await clienteComo('residente2')
    const { data } = await otroResidente.from('reacciones').select('mensaje_id').eq('mensaje_id', mensaje.id)
    expect(data).toEqual([])
  })
})
