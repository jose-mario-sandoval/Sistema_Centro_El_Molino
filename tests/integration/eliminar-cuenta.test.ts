import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { crearCuenta } from '@/lib/cuentas/crear-cuenta'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

/*
 * Eliminar una cuenta contra la base y el Auth reales (migración 20261008100000): se va todo lo de
 * la persona, y lo que es de la casa —los eventos, las series y los enlaces de cena que cargó— se
 * conserva sin autor.
 */

const admin = clienteAdminPrueba()
const USUARIO = 'cuenta.borrable'
const MARCA = 'Eliminar cuenta:'
let ids: Record<ClaveUsuario, string>

beforeAll(async () => {
  ids = await asegurarUsuariosPrueba()
})

afterEach(async () => {
  // Lo de la casa que esta prueba dejó (los eventos sin autor) y lo que escribieron las cuentas fijas.
  const { data: eventos } = await admin.from('eventos').select('id, serie_id').like('titulo', `${MARCA}%`)
  const idsEventos = (eventos ?? []).map((e) => e.id)
  if (idsEventos.length > 0) await admin.from('eventos').delete().in('id', idsEventos)
  await admin.from('series_eventos').delete().like('titulo', `${MARCA}%`)
  await admin.from('mensajes').delete().like('texto', `${MARCA}%`)
  const { data: perfiles } = await admin.from('perfiles').select('id').eq('usuario', USUARIO)
  for (const { id } of perfiles ?? []) await admin.auth.admin.deleteUser(id)
})

/** Una cuenta de Director con de todo: eventos, una serie, un enlace de cena, comidas y mensajes. */
async function crearCuentaConDeTodo() {
  const cuenta = await crearCuenta(admin as never, {
    nombre: 'Cuenta Borrable',
    siglas: 'CB',
    usuario: USUARIO,
    rol: 'director',
    contrasena: 'clave-de-cuenta-borrable-1',
    debeCambiarContrasena: false,
  })
  if (!cuenta.ok) throw new Error(cuenta.error)
  const id = cuenta.id
  const sinError = <T extends { error: unknown }>(r: T): T => {
    if (r.error) throw r.error
    return r
  }

  const evento = sinError(
    await admin.from('eventos').insert({ titulo: `${MARCA} retiro`, fecha: '2026-11-10', tipo: 'san_rafael', creado_por: id }).select('id').single(),
  ).data!
  const serie = sinError(
    await admin
      .from('series_eventos')
      .insert({ patron: 'semanal', dia_semana: 2, fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30', titulo: `${MARCA} círculo`, creado_por: id })
      .select('id')
      .single(),
  ).data!
  sinError(
    await admin.from('eventos').insert([
      { titulo: `${MARCA} círculo`, fecha: '2026-11-03', tipo: 'otro', serie_id: serie.id, creado_por: id },
      { titulo: `${MARCA} círculo`, fecha: '2026-11-10', tipo: 'otro', serie_id: serie.id, creado_por: id },
    ]),
  )
  const enlace = sinError(
    await admin
      .from('enlaces_confirmacion')
      .insert({ evento_id: evento.id, tiempo_comida: 'cena', vence_en: new Date(Date.now() + 172_800_000).toISOString(), creado_por: id })
      .select('id')
      .single(),
  ).data!
  sinError(await admin.from('confirmaciones_extra').insert({ enlace_id: enlace.id, nombre: 'Invitado', cantidad_personas: 2 }))

  sinError(await admin.from('plan_semanal').insert({ usuario_id: id, dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null }))
  sinError(await admin.from('selecciones_comida').insert({ usuario_id: id, fecha: '2026-11-11', comida: 'cena', estado: 'no', origen: 'persona' }))
  sinError(await admin.from('ausencias').insert({ usuario_id: id, desde: '2026-11-20', hasta: '2026-11-21' }))

  // Una publicación suya con la respuesta de otra persona, y su respuesta en la publicación de otra.
  const suya = sinError(await admin.from('mensajes').insert({ autor_id: id, texto: `${MARCA} publicación suya` }).select('id').single()).data!
  sinError(await admin.from('mensajes').insert({ autor_id: ids.residente, padre_id: suya.id, texto: `${MARCA} respuesta ajena` }))
  const ajena = sinError(
    await admin.from('mensajes').insert({ autor_id: ids.residente, texto: `${MARCA} publicación ajena` }).select('id').single(),
  ).data!
  sinError(await admin.from('mensajes').insert({ autor_id: id, padre_id: ajena.id, texto: `${MARCA} respuesta suya` }))

  return { id, evento: evento.id, serie: serie.id, enlace: enlace.id, publicacionAjena: ajena.id }
}

describe('eliminar una cuenta', () => {
  it('el resumen dice lo que se perdería, y solo lo lee el servidor', async () => {
    const { id } = await crearCuentaConDeTodo()
    const { data, error } = await admin.rpc('resumen_para_eliminar_cuenta', { p_usuario: id }).maybeSingle()
    expect(error).toBeNull()
    expect(data).toEqual({ activo: true, mensajes: 2, respuestas_de_otros: 1, eventos: 3 })

    const inexistente = await admin
      .rpc('resumen_para_eliminar_cuenta', { p_usuario: '00000000-0000-4000-8000-000000000000' })
      .maybeSingle()
    expect(inexistente.data).toBeNull()

    // Ni siquiera el Director la llama con su sesión: es del servidor.
    const director = await clienteComo('director')
    const conSesion = await director.rpc('resumen_para_eliminar_cuenta', { p_usuario: id })
    expect(conSesion.error?.code).toBe('42501')
  })

  it('se va todo lo suyo; los eventos, la serie y el enlace de cena se conservan sin autor', async () => {
    const { id, evento, serie, enlace, publicacionAjena } = await crearCuentaConDeTodo()
    const contar = async (tabla: string, columna: string, valor: string) => {
      const { count, error } = await admin.from(tabla).select('*', { count: 'exact', head: true }).eq(columna, valor)
      if (error) throw error
      return count
    }

    // Lo mismo que hace la app: desactivar y después borrar el usuario de Auth.
    expect((await admin.from('perfiles').update({ activo: false }).eq('id', id)).error).toBeNull()
    expect((await admin.auth.admin.deleteUser(id)).error).toBeNull()

    expect(await contar('perfiles', 'id', id)).toBe(0)
    expect(await contar('plan_semanal', 'usuario_id', id)).toBe(0)
    expect(await contar('selecciones_comida', 'usuario_id', id)).toBe(0)
    expect(await contar('ausencias', 'usuario_id', id)).toBe(0)

    // Sus mensajes y lo que otros respondieron dentro de su publicación; la publicación ajena queda.
    const { data: mensajes } = await admin.from('mensajes').select('id, texto').like('texto', `${MARCA}%`)
    expect(mensajes).toEqual([{ id: publicacionAjena, texto: `${MARCA} publicación ajena` }])

    // Lo de la casa sigue, sin autor.
    const { data: eventos } = await admin.from('eventos').select('titulo, creado_por').like('titulo', `${MARCA}%`).order('fecha')
    expect(eventos).toEqual([
      { titulo: `${MARCA} círculo`, creado_por: null },
      { titulo: `${MARCA} retiro`, creado_por: null },
      { titulo: `${MARCA} círculo`, creado_por: null },
    ])
    expect((await admin.from('series_eventos').select('creado_por').eq('id', serie).single()).data).toEqual({ creado_por: null })
    expect((await admin.from('enlaces_confirmacion').select('creado_por').eq('id', enlace).single()).data).toEqual({ creado_por: null })
    expect(await contar('confirmaciones_extra', 'enlace_id', enlace)).toBe(1)

    // Y sigue siendo un evento normal: el Director lo edita, y sigue sin autor.
    const director = await clienteComo('director')
    const editado = await director.from('eventos').update({ titulo: `${MARCA} retiro de otoño` }).eq('id', evento).select('titulo, creado_por')
    expect(editado.error).toBeNull()
    expect(editado.data).toEqual([{ titulo: `${MARCA} retiro de otoño`, creado_por: null }])
  })

  it('nadie cambia quién cargó un evento: ni el servidor (salvo vaciarlo al eliminar la cuenta)', async () => {
    const { id, evento } = await crearCuentaConDeTodo()
    await admin.from('eventos').update({ creado_por: ids.director }).eq('id', evento)
    expect((await admin.from('eventos').select('creado_por').eq('id', evento).single()).data).toEqual({ creado_por: id })
  })
})
