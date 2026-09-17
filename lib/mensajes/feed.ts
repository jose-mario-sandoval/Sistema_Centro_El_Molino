import type { Tabla } from '@/lib/supabase/tipos'

/** Publicaciones por carga (spec §7). */
export const TAMANO_PAGINA = 50
/** Igual que el check de la tabla mensajes. */
export const LARGO_MAXIMO_MENSAJE = 2000

export type MensajeFila = Pick<Tabla<'mensajes'>, 'id' | 'autor_id' | 'padre_id' | 'texto' | 'creado_en'>
export type ReaccionFila = Pick<Tabla<'reacciones'>, 'mensaje_id' | 'usuario_id'>
/** Publicación tal como la devuelve la consulta del feed, con respuestas y reacciones embebidas. */
export type PublicacionFila = MensajeFila & {
  reacciones: Pick<ReaccionFila, 'usuario_id'>[]
  respuestas: MensajeFila[]
}

export type Respuesta = { id: string; autorId: string; texto: string; creadoEn: string }
/** `reacciones`: ids de quienes reaccionaron. */
export type Publicacion = Respuesta & { reacciones: string[]; respuestas: Respuesta[] }

function instante(creadoEn: string): number {
  return Date.parse(creadoEn)
}

/** Más nueva primero; a igual instante, id mayor primero (igual que la consulta). */
function compararPublicaciones(a: Publicacion, b: Publicacion): number {
  return instante(b.creadoEn) - instante(a.creadoEn) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
}

/** Cronológico; a igual instante, id menor primero. */
function compararRespuestas(a: Respuesta, b: Respuesta): number {
  return instante(a.creadoEn) - instante(b.creadoEn) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function aRespuesta(fila: MensajeFila): Respuesta {
  return { id: fila.id, autorId: fila.autor_id, texto: fila.texto, creadoEn: fila.creado_en }
}

function aPublicacion(fila: MensajeFila): Publicacion {
  return { ...aRespuesta(fila), reacciones: [], respuestas: [] }
}

/** Convierte las filas de la consulta (respuestas y reacciones embebidas) al formato del feed, ordenado. */
export function armarFeed(filas: PublicacionFila[]): Publicacion[] {
  return filas
    .map((fila) => ({
      ...aRespuesta(fila),
      reacciones: [...new Set(fila.reacciones.map((r) => r.usuario_id))],
      respuestas: fila.respuestas.map(aRespuesta).sort(compararRespuestas),
    }))
    .sort(compararPublicaciones)
}

/** Agrega una página de publicaciones más antiguas ("Ver anteriores") sin duplicar. */
export function agregarAnteriores(actual: Publicacion[], anteriores: Publicacion[]): Publicacion[] {
  const cargadas = new Set(actual.map((p) => p.id))
  return [...actual, ...anteriores.filter((p) => !cargadas.has(p.id))].sort(compararPublicaciones)
}

/** Cursor para "Ver anteriores": creado_en de la publicación más antigua, tal como vino de la base. */
export function cursorAnteriores(publicaciones: Publicacion[]): string | null {
  return publicaciones.at(-1)?.creadoEn ?? null
}

/**
 * INSERT de `mensajes`: evento de tiempo real (`desdeEvento`) o mensaje propio recién creado. Idempotente.
 * Si el mensaje ya está (el propio llega primero desde la acción), solo el evento lo actualiza: trae el
 * creado_en de la base, que reemplaza la hora provisional del navegador. Devuelve el mismo arreglo si no cambia nada.
 */
export function aplicarInsercionMensaje(
  feed: Publicacion[],
  fila: MensajeFila,
  { desdeEvento = false }: { desdeEvento?: boolean } = {},
): Publicacion[] {
  const yaEsta = (m: Respuesta | undefined) => m !== undefined && (!desdeEvento || m.creadoEn === fila.creado_en)

  const padreId = fila.padre_id
  if (padreId === null) {
    const existente = feed.find((p) => p.id === fila.id)
    if (yaEsta(existente)) return feed
    if (!existente) return [...feed, aPublicacion(fila)].sort(compararPublicaciones)
    return feed.map((p) => (p.id === fila.id ? { ...p, ...aRespuesta(fila) } : p)).sort(compararPublicaciones)
  }
  let cambio = false
  const siguiente = feed.map((p) => {
    if (p.id !== padreId) return p
    if (yaEsta(p.respuestas.find((r) => r.id === fila.id))) return p
    cambio = true
    const otras = p.respuestas.filter((r) => r.id !== fila.id)
    return { ...p, respuestas: [...otras, aRespuesta(fila)].sort(compararRespuestas) }
  })
  return cambio ? siguiente : feed
}

/** Evento DELETE de `mensajes`: trae solo el id (spec §7). */
export function aplicarBorradoMensaje(feed: Publicacion[], id: string): Publicacion[] {
  if (feed.some((p) => p.id === id)) return feed.filter((p) => p.id !== id)
  let cambio = false
  const siguiente = feed.map((p) => {
    if (!p.respuestas.some((r) => r.id === id)) return p
    cambio = true
    return { ...p, respuestas: p.respuestas.filter((r) => r.id !== id) }
  })
  return cambio ? siguiente : feed
}

export function tieneReaccion(feed: Publicacion[], mensajeId: string, usuarioId: string): boolean {
  return feed.find((p) => p.id === mensajeId)?.reacciones.includes(usuarioId) ?? false
}

/**
 * Deja la reacción de `usuarioId` presente o ausente. Idempotente: sirve para los eventos
 * INSERT/DELETE de `reacciones` (clave mensaje_id + usuario_id), el cambio optimista al tocar 👍 y su reversión.
 */
export function fijarReaccion(feed: Publicacion[], mensajeId: string, usuarioId: string, presente: boolean): Publicacion[] {
  let cambio = false
  const siguiente = feed.map((p) => {
    if (p.id !== mensajeId || p.reacciones.includes(usuarioId) === presente) return p
    cambio = true
    return {
      ...p,
      reacciones: presente ? [...p.reacciones, usuarioId] : p.reacciones.filter((u) => u !== usuarioId),
    }
  })
  return cambio ? siguiente : feed
}
