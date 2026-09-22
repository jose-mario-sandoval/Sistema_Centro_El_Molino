import {
  aplicarActualizacionMensaje,
  aplicarBorradoMensaje,
  aplicarInsercionMensaje,
  fijarReaccion,
  type MensajeFila,
  type Publicacion,
} from '@/lib/mensajes/feed'

/**
 * Cambio sobre el feed (evento de tiempo real o cambio optimista). Todos son idempotentes, así que se
 * pueden volver a aplicar sobre datos recién recargados sin duplicar nada.
 */
export type CambioFeed = (feed: Publicacion[]) => Publicacion[]

/** Lo que el feed usa de un evento de Postgres Changes (RealtimePostgresChangesPayload de supabase-js). */
export type EventoTiempoReal = {
  table: string
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: Record<string, unknown>
  old: Record<string, unknown>
  errors?: string[] | null
}

export type EventoLeido = {
  cambio: CambioFeed
  /** Autor de un mensaje nuevo: si su perfil no está cargado, hay que pedirlo. */
  autorId?: string
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === 'string' && valor !== ''
}

function filaMensaje(datos: Record<string, unknown>): MensajeFila | null {
  const { id, autor_id, padre_id, texto, creado_en, estado, motivo_rechazo } = datos
  if (!esTexto(id) || !esTexto(autor_id) || typeof texto !== 'string' || !esTexto(creado_en)) return null
  if (padre_id !== null && !esTexto(padre_id)) return null
  if (estado !== 'pendiente' && estado !== 'aprobado' && estado !== 'rechazado') return null
  if (motivo_rechazo !== null && typeof motivo_rechazo !== 'string') return null
  return { id, autor_id, padre_id, texto, creado_en, estado, motivo_rechazo }
}

/**
 * Traduce un evento a un cambio del feed, o null si hay que ignorarlo. Cuando RLS no deja ver la fila
 * (p. ej. token vencido), Realtime manda `errors` ("Error 401") y la fila vacía.
 */
export function leerEvento(evento: EventoTiempoReal): EventoLeido | null {
  if (evento.errors?.length) return null

  if (evento.table === 'mensajes') {
    if (evento.eventType === 'INSERT') {
      const fila = filaMensaje(evento.new)
      if (!fila) return null
      return { cambio: (feed) => aplicarInsercionMensaje(feed, fila, { desdeEvento: true }), autorId: fila.autor_id }
    }
    if (evento.eventType === 'UPDATE') {
      const fila = filaMensaje(evento.new)
      if (!fila) return null
      return { cambio: (feed) => aplicarActualizacionMensaje(feed, fila), autorId: fila.autor_id }
    }
    if (evento.eventType === 'DELETE') {
      // Los DELETE traen solo la clave primaria (spec §7).
      const { id } = evento.old
      return esTexto(id) ? { cambio: (feed) => aplicarBorradoMensaje(feed, id) } : null
    }
    return null
  }

  if (evento.table === 'reacciones' && evento.eventType !== 'UPDATE') {
    const presente = evento.eventType === 'INSERT'
    const { mensaje_id, usuario_id } = presente ? evento.new : evento.old
    if (!esTexto(mensaje_id) || !esTexto(usuario_id)) return null
    return { cambio: (feed) => fijarReaccion(feed, mensaje_id, usuario_id, presente) }
  }

  return null
}

/** Vuelve a aplicar, en orden, los cambios que llegaron mientras se recargaba el feed. */
export function aplicarCambios(feed: Publicacion[], cambios: readonly CambioFeed[]): Publicacion[] {
  return cambios.reduce((actual, cambio) => cambio(actual), feed)
}
