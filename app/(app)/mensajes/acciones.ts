'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { listarPublicaciones, type PaginaFeed } from '@/lib/mensajes/consultas'
import { listarPerfiles, type PerfilResumen } from '@/lib/perfiles/consultas'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'
import {
  esquemaBorrado,
  esquemaPaginaMensajes,
  esquemaPublicacion,
  esquemaReaccion,
  esquemaRespuesta,
} from '@/lib/validacion/mensajes'

type ResultadoId = Resultado<{ id: string }>
type ClienteServidor = Awaited<ReturnType<typeof crearClienteServidor>>

/**
 * 23505 al insertar con el id que generó el navegador: es un reintento de un envío que sí se guardó (se
 * perdió la respuesta) si ese mensaje ya es de quien envía y cuelga del mismo padre. Si no, el id no es de
 * este envío y no se informa como creado.
 */
async function esReintentoGuardado(
  supabase: ClienteServidor,
  { id, autorId, padreId }: { id: string; autorId: string; padreId: string | null },
): Promise<boolean> {
  const consulta = supabase.from('mensajes').select('id').eq('id', id).eq('autor_id', autorId)
  const { data, error } = await (padreId === null ? consulta.is('padre_id', null) : consulta.eq('padre_id', padreId))
    .maybeSingle()
  if (error) console.error('esReintentoGuardado', error)
  return data !== null
}

/**
 * Contrato con la pista 06: devuelve el id de la publicación creada. Idempotente: el id lo genera el
 * navegador y se repite al reintentar (lib/mensajes/envio.ts).
 */
export async function publicarMensaje(_previo: ResultadoId | null, formData: FormData): Promise<ResultadoId> {
  const sesion = await perfilParaAccion()
  if (!sesion.ok) return sesion

  const entrada = esquemaPublicacion.safeParse({ id: formData.get('id'), texto: formData.get('texto') })
  if (!entrada.success) return fallo('Revisá el mensaje.', camposConError(entrada.error))
  const { id, texto } = entrada.data
  const autorId = sesion.perfil.id

  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('mensajes').insert({ id, autor_id: autorId, texto })
  if (error) {
    // Reintento de un envío ya guardado: éxito sin duplicar. No se revalida ni se avisa de nuevo; eso ya
    // lo hizo el envío que guardó el mensaje.
    if (error.code === '23505' && (await esReintentoGuardado(supabase, { id, autorId, padreId: null }))) {
      return exito({ id })
    }
    console.error('publicarMensaje', error)
    return fallo('No se pudo publicar el mensaje. Intentá de nuevo.')
  }

  revalidatePath('/mensajes')
  return exito({ id })
}

/** Contrato con la pista 06: devuelve el id de la respuesta creada. Idempotente como publicarMensaje. */
export async function responderMensaje(_previo: ResultadoId | null, formData: FormData): Promise<ResultadoId> {
  const sesion = await perfilParaAccion()
  if (!sesion.ok) return sesion

  const entrada = esquemaRespuesta.safeParse({
    id: formData.get('id'),
    padreId: formData.get('padreId'),
    texto: formData.get('texto'),
  })
  if (!entrada.success) return fallo('Revisá la respuesta.', camposConError(entrada.error))
  const { id, padreId, texto } = entrada.data
  const autorId = sesion.perfil.id

  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('mensajes').insert({ id, autor_id: autorId, padre_id: padreId, texto })
  if (error) {
    // Ver publicarMensaje.
    if (error.code === '23505' && (await esReintentoGuardado(supabase, { id, autorId, padreId }))) {
      return exito({ id })
    }
    if (error.code === 'MOL03') return fallo('Solo se puede responder a publicaciones.')
    if (error.code === '23503') return fallo('La publicación ya no existe.')
    console.error('responderMensaje', error)
    return fallo('No se pudo enviar la respuesta. Intentá de nuevo.')
  }

  revalidatePath('/mensajes')
  return exito({ id })
}

/**
 * `presente` es el estado final deseado: idempotente ante doble clic y reversiones (decisión 3).
 * Excepción deliberada al índice §3.3: sin revalidatePath. La interfaz optimista y el tiempo real ya muestran
 * el cambio, y revalidar volvería a renderizar la página entera en el servidor por cada 👍.
 */
export async function alternarReaccion(entrada: unknown): Promise<Resultado<{ presente: boolean }>> {
  const sesion = await perfilParaAccion()
  if (!sesion.ok) return sesion

  const datos = esquemaReaccion.safeParse(entrada)
  if (!datos.success) return fallo('Reacción inválida.')
  const { mensajeId, presente } = datos.data

  const supabase = await crearClienteServidor()
  if (presente) {
    const { error } = await supabase.from('reacciones').insert({ mensaje_id: mensajeId, usuario_id: sesion.perfil.id })
    // 23505: ya estaba puesta (otra pestaña o doble clic); el estado final es el pedido.
    if (error && error.code !== '23505') {
      if (error.code === 'MOL03') return fallo('Solo se puede reaccionar a publicaciones.')
      if (error.code === '23503') return fallo('El mensaje ya no existe.')
      console.error('alternarReaccion', error)
      return fallo('No se pudo guardar tu reacción. Intentá de nuevo.')
    }
  } else {
    const { error } = await supabase
      .from('reacciones')
      .delete()
      .eq('mensaje_id', mensajeId)
      .eq('usuario_id', sesion.perfil.id)
    if (error) {
      console.error('alternarReaccion', error)
      return fallo('No se pudo quitar tu reacción. Intentá de nuevo.')
    }
  }

  return exito({ presente })
}

/** Autor o Director (RLS). Si no corresponde, el DELETE afecta 0 filas sin error. */
export async function borrarMensaje(entrada: unknown): Promise<ResultadoId> {
  const sesion = await perfilParaAccion()
  if (!sesion.ok) return sesion

  const datos = esquemaBorrado.safeParse(entrada)
  if (!datos.success) return fallo('Mensaje inválido.')

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('mensajes').delete().eq('id', datos.data.id).select('id')
  if (error) {
    console.error('borrarMensaje', error)
    return fallo('No se pudo eliminar el mensaje. Intentá de nuevo.')
  }
  if (data.length === 0) return fallo('No se pudo eliminar: el mensaje ya no existe o no tenés permiso.')

  revalidatePath('/mensajes')
  return exito({ id: datos.data.id })
}

/** Primera página (`antesDe: null`) o "Ver anteriores". */
export async function cargarMensajes(entrada: unknown): Promise<Resultado<PaginaFeed>> {
  const sesion = await perfilParaAccion()
  if (!sesion.ok) return sesion

  const datos = esquemaPaginaMensajes.safeParse(entrada)
  if (!datos.success) return fallo('No se pudieron cargar los mensajes.')

  try {
    return exito(await listarPublicaciones(datos.data.antesDe))
  } catch (error) {
    console.error('cargarMensajes', error)
    return fallo('No se pudieron cargar los mensajes. Revisá tu conexión.')
  }
}

/** Todos los perfiles, incluidos los inactivos (autores de mensajes antiguos). */
export async function cargarPerfiles(): Promise<Resultado<PerfilResumen[]>> {
  const sesion = await perfilParaAccion()
  if (!sesion.ok) return sesion

  try {
    return exito(await listarPerfiles())
  } catch (error) {
    console.error('cargarPerfiles', error)
    return fallo('No se pudieron cargar los perfiles.')
  }
}
