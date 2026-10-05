import 'server-only'
import type { TiempoComida } from '@/lib/comidas/tipos'
import type { FechaISO } from '@/lib/fechas'
import type { Rol } from '@/lib/perfiles/roles'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import {
  destinatarioModeracion,
  destinatariosPendiente,
  destinatariosPublicacion,
  destinatariosRecordatorio,
  destinatariosRespuesta,
  separarPorVisibilidad,
  type PerfilAviso,
} from './destinatarios'
import { enviarAUsuarios, type ResumenEnvio } from './enviar'
import {
  cargaMensajePendiente,
  cargaModeracion,
  cargaNuevaPublicacion,
  cargaNuevaRespuesta,
  cargaRecordatorio,
  type CargaPush,
  type TipoPendiente,
} from './mensajes-push'

/*
 * Nunca lanzan: se ejecutan dentro de after(), cuando la respuesta ya se envió.
 * Los errores quedan en los logs de Vercel (spec §9.1).
 */

export type PerfilConNombre = PerfilAviso & { nombre: string; siglas: string; rol: Rol }

/**
 * Todos los perfiles con sus preferencias (también lo usa lib/push/avisos-casa.ts).
 *
 * Si la base todavía no tiene avisar_cambios/avisar_cocina (42703: el código llegó antes que la
 * migración 20260929120000), se leen las de siempre y las nuevas valen true: así los avisos de
 * mensajes y los recordatorios nunca dejan de salir por una migración pendiente.
 */
export async function leerPerfiles(): Promise<PerfilConNombre[]> {
  const admin = crearClienteAdmin()
  const { data, error } = await admin
    .from('perfiles')
    .select('id, nombre, siglas, rol, activo, avisar_mensajes, avisar_hora_limite, avisar_cambios, avisar_cocina')
  if (!error) return data
  if (error.code !== '42703') throw error

  console.error('[push] perfiles sin avisar_cambios/avisar_cocina: falta aplicar 20260929120000_preferencias_avisos.sql')
  const anteriores = await admin.from('perfiles').select('id, nombre, siglas, rol, activo, avisar_mensajes, avisar_hora_limite')
  if (anteriores.error) throw anteriores.error
  return anteriores.data.map((perfil) => ({ ...perfil, avisar_cambios: true, avisar_cocina: true }))
}

/**
 * Envía el aviso de un mensaje con el autor como cada grupo lo ve en la app: con nombre para
 * Directores y Residentes, con siglas para Administración (lib/perfiles/visibilidad.ts).
 */
async function enviarConAutor(
  ids: string[],
  perfiles: PerfilConNombre[],
  autorId: string,
  armar: (autor: string) => CargaPush,
): Promise<ResumenEnvio> {
  const autor = perfiles.find((p) => p.id === autorId)
  const { conNombre, soloSiglas } = separarPorVisibilidad(ids, perfiles)
  const nada: ResumenEnvio = { enviadas: 0, caducadas: 0, fallidas: 0, descartadas: 0 }
  const [a, b] = await Promise.all([
    conNombre.length > 0 ? enviarAUsuarios(conNombre, armar(autor?.nombre ?? 'Alguien')) : nada,
    soloSiglas.length > 0 ? enviarAUsuarios(soloSiglas, armar(autor?.siglas ?? 'Alguien')) : nada,
  ])
  return {
    enviadas: a.enviadas + b.enviadas,
    caducadas: a.caducadas + b.caducadas,
    fallidas: a.fallidas + b.fallidas,
    descartadas: a.descartadas + b.descartadas,
  }
}

/**
 * Cuando una publicación queda aprobada (al publicar si publicaDirecto, o al aprobarla el Director): avisa a
 * todos menos al autor. Un pendiente nunca se avisa: el aviso lleva el texto y le llegaría a quien todavía
 * no puede verlo. Quien llama ya lo decide así; esto es la segunda barrera.
 */
export async function avisarNuevaPublicacion(mensajeId: string, opciones: { excluir?: string } = {}): Promise<void> {
  try {
    const { data: mensaje, error } = await crearClienteAdmin()
      .from('mensajes')
      .select('id, autor_id, padre_id, texto, estado')
      .eq('id', mensajeId)
      .maybeSingle()
    if (error) throw error
    if (!mensaje || mensaje.padre_id !== null || mensaje.estado !== 'aprobado') return

    const perfiles = await leerPerfiles()
    // `excluir`: el Director que acaba de aprobarlo (nunca se avisa a quien hizo el cambio).
    const ids = destinatariosPublicacion({ autorId: mensaje.autor_id, perfiles }).filter((id) => id !== opciones.excluir)
    const resumen = await enviarConAutor(ids, perfiles, mensaje.autor_id, (autor) =>
      cargaNuevaPublicacion({ id: mensaje.id, autor, texto: mensaje.texto }),
    )
    console.log('[push] nueva publicación', { mensajeId, destinatarios: ids.length, ...resumen })
  } catch (error) {
    console.error('[push] aviso de nueva publicación', { mensajeId, error })
  }
}

/**
 * Cuando una respuesta queda aprobada: avisa al autor de la publicación y a quienes ya respondieron. Igual
 * que avisarNuevaPublicacion, nada que esté pendiente; tampoco si la publicación todavía no está aprobada.
 */
export async function avisarNuevaRespuesta(respuestaId: string, opciones: { excluir?: string } = {}): Promise<void> {
  try {
    const admin = crearClienteAdmin()
    const { data: respuesta, error } = await admin
      .from('mensajes')
      .select('id, autor_id, padre_id, texto, estado')
      .eq('id', respuestaId)
      .maybeSingle()
    if (error) throw error
    if (!respuesta?.padre_id || respuesta.estado !== 'aprobado') return

    const [publicacion, hilo, perfiles] = await Promise.all([
      admin.from('mensajes').select('autor_id, estado').eq('id', respuesta.padre_id).maybeSingle(),
      admin.from('mensajes').select('autor_id').eq('padre_id', respuesta.padre_id),
      leerPerfiles(),
    ])
    if (publicacion.error) throw publicacion.error
    if (hilo.error) throw hilo.error
    if (!publicacion.data || publicacion.data.estado !== 'aprobado') return

    const ids = destinatariosRespuesta({
      autorPublicacionId: publicacion.data.autor_id,
      autoresRespuestas: hilo.data.map((m) => m.autor_id),
      quienRespondeId: respuesta.autor_id,
      perfiles,
    }).filter((id) => id !== opciones.excluir)
    const resumen = await enviarConAutor(ids, perfiles, respuesta.autor_id, (autor) =>
      cargaNuevaRespuesta({ id: respuesta.id, autor, texto: respuesta.texto }),
    )
    console.log('[push] nueva respuesta', { respuestaId, destinatarios: ids.length, ...resumen })
  } catch (error) {
    console.error('[push] aviso de nueva respuesta', { respuestaId, error })
  }
}

/**
 * Un mensaje quedó esperando aprobación (lo publicó o respondió un Residente, o lo corrigió tras un
 * rechazo): avisa a los Directores, que lo pueden ver y conocen los nombres. Relee el estado: si ya
 * lo aprobaron o rechazaron entre tanto, no avisa. El aviso público sigue saliendo solo al aprobarlo.
 */
export async function avisarMensajePendiente(mensajeId: string, opciones: { correccion?: boolean } = {}): Promise<void> {
  try {
    const admin = crearClienteAdmin()
    const { data: mensaje, error } = await admin
      .from('mensajes')
      .select('id, autor_id, padre_id, estado')
      .eq('id', mensajeId)
      .maybeSingle()
    if (error) throw error
    if (!mensaje || mensaje.estado !== 'pendiente') return

    const [perfiles, conteo] = await Promise.all([
      leerPerfiles(),
      admin.from('mensajes').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    ])
    if (conteo.error) throw conteo.error

    const tipo: TipoPendiente = opciones.correccion ? 'correccion' : mensaje.padre_id === null ? 'publicacion' : 'respuesta'
    const ids = destinatariosPendiente({ autorId: mensaje.autor_id, perfiles })
    const resumen = await enviarConAutor(ids, perfiles, mensaje.autor_id, (autor) =>
      cargaMensajePendiente({ autor, tipo, pendientes: conteo.count ?? 1 }),
    )
    console.log('[push] mensaje por aprobar', { mensajeId, destinatarios: ids.length, ...resumen })
  } catch (error) {
    console.error('[push] aviso de mensaje por aprobar', { mensajeId, error })
  }
}

/**
 * El Director aprobó o rechazó un mensaje: avisa al autor (nunca a quien moderó). Solo si el mensaje
 * sigue en ese estado: si el autor ya lo corrigió y volvió a pendiente, el aviso no corresponde.
 */
export async function avisarModeracion(
  mensajeId: string,
  moderadorId: string,
  estado: 'aprobado' | 'rechazado',
): Promise<void> {
  try {
    const { data: mensaje, error } = await crearClienteAdmin()
      .from('mensajes')
      .select('id, autor_id, padre_id, estado, motivo_rechazo')
      .eq('id', mensajeId)
      .maybeSingle()
    if (error) throw error
    if (!mensaje || mensaje.estado !== estado) return

    const perfiles = await leerPerfiles()
    const ids = destinatarioModeracion({ autorId: mensaje.autor_id, moderadorId, perfiles })
    const resumen = await enviarAUsuarios(
      ids,
      cargaModeracion({ id: mensaje.id, estado, esRespuesta: mensaje.padre_id !== null, motivo: mensaje.motivo_rechazo }),
    )
    console.log('[push] moderación', { mensajeId, estado, destinatarios: ids.length, ...resumen })
  } catch (error) {
    console.error('[push] aviso de moderación', { mensajeId, error })
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
