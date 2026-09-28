import type { Rol } from '@/lib/perfiles/roles'
import type { Tabla } from '@/lib/supabase/tipos'

/** Publicaciones por carga (spec §7). */
export const TAMANO_PAGINA = 50
/** Igual que el check de la tabla mensajes. */
export const LARGO_MAXIMO_MENSAJE = 2000

export type EstadoMensaje = 'pendiente' | 'aprobado' | 'rechazado'
export type MensajeFila = Pick<
  Tabla<'mensajes'>,
  'id' | 'autor_id' | 'padre_id' | 'texto' | 'creado_en' | 'estado' | 'motivo_rechazo' | 'fijado_en' | 'fijado_hasta' | 'fijado_por'
>
export type ReaccionFila = Pick<Tabla<'reacciones'>, 'mensaje_id' | 'usuario_id'>
/** Publicación tal como la devuelve la consulta del feed, con respuestas y reacciones embebidas. */
export type PublicacionFila = MensajeFila & {
  reacciones: Pick<ReaccionFila, 'usuario_id'>[]
  respuestas: MensajeFila[]
}

export type Respuesta = { id: string; autorId: string; texto: string; creadoEn: string; estado: EstadoMensaje; motivoRechazo: string | null }
/**
 * Solo las publicaciones se fijan. `fijadoEn` nulo = no fijada; `fijadoHasta` nulo = hasta que la quiten;
 * `fijadoPor`: quién la fijó (en pantalla, solo su rol).
 */
export type DatosFijado = { fijadoEn: string | null; fijadoHasta: string | null; fijadoPor: string | null }
/** `reacciones`: ids de quienes reaccionaron. */
export type Publicacion = Respuesta & DatosFijado & { reacciones: string[]; respuestas: Respuesta[] }

/** Espejo de mensajes_forzar_estado() en SQL: quién publica sin pasar por la aprobación del Director. */
export function publicaDirecto(rol: Rol): boolean {
  return rol === 'director' || rol === 'administracion'
}

/**
 * Microsegundos desde 1970. Postgres guarda microsegundos y Date solo milisegundos: comparando con Date, dos
 * publicaciones del mismo milisegundo quedaban en otro orden que en la consulta, y el cursor de "Ver
 * anteriores" (la última de la lista) podía no ser la más antigua, con publicaciones repetidas en la página
 * siguiente. Acepta también la hora del navegador (`toISOString()`, milisegundos y `Z`).
 */
function instante(creadoEn: string): number {
  const partes = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(.*)$/.exec(creadoEn)
  if (!partes) return Date.parse(creadoEn) * 1000
  const [, hastaSegundos, fraccion = '', zona] = partes
  return Date.parse(hastaSegundos + zona) * 1000 + Number(fraccion.padEnd(6, '0').slice(0, 6))
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
  return {
    id: fila.id,
    autorId: fila.autor_id,
    texto: fila.texto,
    creadoEn: fila.creado_en,
    estado: fila.estado,
    motivoRechazo: fila.motivo_rechazo,
  }
}

function datosFijado(fila: MensajeFila): DatosFijado {
  return { fijadoEn: fila.fijado_en, fijadoHasta: fila.fijado_hasta, fijadoPor: fila.fijado_por }
}

function aPublicacion(fila: MensajeFila): Publicacion {
  return { ...aRespuesta(fila), ...datosFijado(fila), reacciones: [], respuestas: [] }
}

/** Convierte las filas de la consulta (respuestas y reacciones embebidas) al formato del feed, ordenado. */
export function armarFeed(filas: PublicacionFila[]): Publicacion[] {
  return filas
    .map((fila) => ({
      ...aRespuesta(fila),
      ...datosFijado(fila),
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

/**
 * Cursor para "Ver anteriores": creado_en de la publicación más antigua, tal como vino de la base. Solo sobre
 * una página cronológica (consulta-feed.ts): el feed del navegador mezcla fijadas que pueden ser más viejas.
 */
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

/**
 * Evento UPDATE de `mensajes` (aprobar/rechazar/editar/fijar). A diferencia de una inserción, no se puede
 * asumir que el mensaje ya está en el feed local: quien lo recibe puede estar viéndolo por primera
 * vez recién ahora que se volvió visible (antes estaba pendiente), o puede ser una publicación vieja que
 * alguien fijó o quitó de fijados. Una publicación que no está cargada no se inserta desde la fila del
 * evento: llegaría sin sus reacciones ni respuestas. El feed la trae completa (`publicacionActualizada` en
 * leerEvento). Si el padre de una respuesta recién visible no está cargado, no hay nada que hacer todavía —
 * aparecerá cuando el padre también lo esté.
 */
export function aplicarActualizacionMensaje(feed: Publicacion[], fila: MensajeFila): Publicacion[] {
  const padreId = fila.padre_id
  if (padreId === null) {
    if (!feed.some((p) => p.id === fila.id)) return feed
    return feed
      .map((p) => (p.id === fila.id ? { ...p, ...aRespuesta(fila), ...datosFijado(fila) } : p))
      .sort(compararPublicaciones)
  }
  const padre = feed.find((p) => p.id === padreId)
  if (!padre) return feed
  const existeRespuesta = padre.respuestas.some((r) => r.id === fila.id)
  const respuestas = existeRespuesta
    ? padre.respuestas.map((r) => (r.id === fila.id ? { ...r, ...aRespuesta(fila) } : r))
    : [...padre.respuestas, aRespuesta(fila)].sort(compararRespuestas)
  return feed.map((p) => (p.id === padreId ? { ...p, respuestas } : p))
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

/**
 * Deja la publicación `id` fijada arriba con `datos`, o sin fijar con `null`. Idempotente como fijarReaccion:
 * sirve para el resultado de la acción y para el evento de tiempo real que llega después.
 */
export function aplicarFijado(feed: Publicacion[], id: string, datos: DatosFijado | null): Publicacion[] {
  const final: DatosFijado = datos ?? { fijadoEn: null, fijadoHasta: null, fijadoPor: null }
  let cambio = false
  const siguiente = feed.map((p) => {
    if (
      p.id !== id ||
      (p.fijadoEn === final.fijadoEn && p.fijadoHasta === final.fijadoHasta && p.fijadoPor === final.fijadoPor)
    ) {
      return p
    }
    cambio = true
    return { ...p, ...final }
  })
  return cambio ? siguiente : feed
}
