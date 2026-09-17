import 'server-only'
import type { TiempoComida } from '@/lib/comidas/tipos'
import type { FechaISO } from '@/lib/fechas'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import {
  destinatariosPublicacion,
  destinatariosRecordatorio,
  destinatariosRespuesta,
  type PerfilAviso,
} from './destinatarios'
import { enviarAUsuarios } from './enviar'
import { cargaNuevaPublicacion, cargaNuevaRespuesta, cargaRecordatorio } from './mensajes-push'

/*
 * Nunca lanzan: se ejecutan dentro de after(), cuando la respuesta ya se envió.
 * Los errores quedan en los logs de Vercel (spec §9.1).
 */

type PerfilConNombre = PerfilAviso & { nombre: string }

async function leerPerfiles(): Promise<PerfilConNombre[]> {
  const { data, error } = await crearClienteAdmin()
    .from('perfiles')
    .select('id, nombre, activo, avisar_mensajes, avisar_hora_limite')
  if (error) throw error
  return data
}

function nombreDe(perfiles: PerfilConNombre[], id: string): string {
  return perfiles.find((p) => p.id === id)?.nombre ?? 'Alguien'
}

/** Tras publicar: avisa a todos menos al autor. */
export async function avisarNuevaPublicacion(mensajeId: string): Promise<void> {
  try {
    const { data: mensaje, error } = await crearClienteAdmin()
      .from('mensajes')
      .select('id, autor_id, padre_id, texto')
      .eq('id', mensajeId)
      .maybeSingle()
    if (error) throw error
    if (!mensaje || mensaje.padre_id !== null) return

    const perfiles = await leerPerfiles()
    const ids = destinatariosPublicacion({ autorId: mensaje.autor_id, perfiles })
    const resumen = await enviarAUsuarios(
      ids,
      cargaNuevaPublicacion({ id: mensaje.id, autor: nombreDe(perfiles, mensaje.autor_id), texto: mensaje.texto }),
    )
    console.log('[push] nueva publicación', { mensajeId, destinatarios: ids.length, ...resumen })
  } catch (error) {
    console.error('[push] aviso de nueva publicación', { mensajeId, error })
  }
}

/** Tras responder: avisa al autor de la publicación y a quienes ya respondieron. */
export async function avisarNuevaRespuesta(respuestaId: string): Promise<void> {
  try {
    const admin = crearClienteAdmin()
    const { data: respuesta, error } = await admin
      .from('mensajes')
      .select('id, autor_id, padre_id, texto')
      .eq('id', respuestaId)
      .maybeSingle()
    if (error) throw error
    if (!respuesta?.padre_id) return

    const [publicacion, hilo, perfiles] = await Promise.all([
      admin.from('mensajes').select('autor_id').eq('id', respuesta.padre_id).maybeSingle(),
      admin.from('mensajes').select('autor_id').eq('padre_id', respuesta.padre_id),
      leerPerfiles(),
    ])
    if (publicacion.error) throw publicacion.error
    if (hilo.error) throw hilo.error
    if (!publicacion.data) return

    const ids = destinatariosRespuesta({
      autorPublicacionId: publicacion.data.autor_id,
      autoresRespuestas: hilo.data.map((m) => m.autor_id),
      quienRespondeId: respuesta.autor_id,
      perfiles,
    })
    const resumen = await enviarAUsuarios(
      ids,
      cargaNuevaRespuesta({ id: respuesta.id, autor: nombreDe(perfiles, respuesta.autor_id), texto: respuesta.texto }),
    )
    console.log('[push] nueva respuesta', { respuestaId, destinatarios: ids.length, ...resumen })
  } catch (error) {
    console.error('[push] aviso de nueva respuesta', { respuestaId, error })
  }
}

/** Recordatorio de hora límite para quienes tienen la comida "Sin definir" (contrato 02-A). */
export async function enviarRecordatorio(fecha: FechaISO, comida: TiempoComida, cierre: Date): Promise<void> {
  try {
    const [sinDefinir, perfiles] = await Promise.all([
      crearClienteAdmin().rpc('comidas_sin_definir', { p_fecha: fecha, p_comida: comida }),
      leerPerfiles(),
    ])
    if (sinDefinir.error) throw sinDefinir.error

    const ids = destinatariosRecordatorio({ sinDefinir: sinDefinir.data, perfiles })
    const resumen = await enviarAUsuarios(ids, cargaRecordatorio({ fecha, comida, cierre, ahora: new Date() }), {
      ttlSegundos: 60 * 60,
    })
    console.log('[push] recordatorio', { fecha, comida, destinatarios: ids.length, ...resumen })
  } catch (error) {
    console.error('[push] recordatorio de hora límite', { fecha, comida, error })
  }
}
