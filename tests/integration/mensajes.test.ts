import { afterEach, beforeAll, describe, expect, it } from 'vitest'
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
    const vacio = await residente.from('mensajes').insert({ autor_id: ids.residente, texto: '   ' })
    expect(vacio.error?.code).toBe('23514')
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
    expect(borrado.data).toEqual([])
    expect(await registroCon('Registro protegido')).toHaveLength(1)
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
