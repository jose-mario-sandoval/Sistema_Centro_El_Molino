import type { Tabla } from '@/lib/supabase/tipos'

/** Publicaciones por carga (spec §7). */
export const TAMANO_PAGINA = 50
/** Igual que el check de la tabla mensajes. */
export const LARGO_MAXIMO_MENSAJE = 2000

export type MensajeFila = Pick<Tabla<'mensajes'>, 'id' | 'autor_id' | 'padre_id' | 'texto' | 'creado_en'>
export type ReaccionFila = Pick<Tabla<'reacciones'>, 'mensaje_id' | 'usuario_id'>

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

/** Arma publicación → respuestas con sus reacciones. Descarta respuestas y reacciones de publicaciones no cargadas. */
export function armarFeed(mensajes: MensajeFila[], reacciones: ReaccionFila[]): Publicacion[] {
  const porId = new Map<string, Publicacion>()
  for (const fila of mensajes) {
    if (fila.padre_id === null) porId.set(fila.id, aPublicacion(fila))
  }
  for (const fila of mensajes) {
    if (fila.padre_id !== null) porId.get(fila.padre_id)?.respuestas.push(aRespuesta(fila))
  }
  for (const r of reacciones) {
    const publicacion = porId.get(r.mensaje_id)
    if (publicacion && !publicacion.reacciones.includes(r.usuario_id)) publicacion.reacciones.push(r.usuario_id)
  }
  const publicaciones = [...porId.values()]
  for (const p of publicaciones) p.respuestas.sort(compararRespuestas)
  return publicaciones.sort(compararPublicaciones)
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
