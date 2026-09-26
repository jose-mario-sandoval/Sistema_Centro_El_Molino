import type { SupabaseClient } from '@supabase/supabase-js'
import {
  armarFeed,
  cursorAnteriores,
  TAMANO_PAGINA,
  type MensajeFila,
  type Publicacion,
  type PublicacionFila,
} from '@/lib/mensajes/feed'
import type { Database } from '@/lib/supabase/database.types'

/**
 * `publicaciones`: la página cronológica. `fijadas`: las fijadas vigentes (solo en la primera página; pueden
 * repetir alguna de `publicaciones` o ser más viejas que toda la página). `cursor`: creado_en de la última
 * publicación cronológica, para "Ver anteriores" — no se puede sacar del arreglo ya mezclado con las
 * fijadas, porque una fijada vieja al final daría un cursor demasiado antiguo y se saltearían publicaciones.
 */
export type PaginaFeed = { publicaciones: Publicacion[]; fijadas: Publicacion[]; hayMas: boolean; cursor: string | null }

/**
 * Igual que `max_rows` de [api] en supabase/config.toml (producción lo recibe con `config push`; una prueba
 * unitaria verifica que coincidan). PostgREST corta ahí, sin avisar, las filas del nivel superior y también
 * cada lista embebida.
 */
export const MAXIMO_FILAS_API = 1000

/** Cuántas fijadas se muestran como máximo. */
export const MAXIMO_FIJADAS = 20

/**
 * Una consulta con recursos embebidos para la página; solo una publicación con MAXIMO_FILAS_API respuestas o
 * más (lista posiblemente cortada) necesita pedidos aparte. Las reacciones no: hay a lo sumo una por persona.
 * `mensajes!padre_id`: en una FK a la misma tabla, PostgREST elige el lado uno-a-muchos (las respuestas).
 */
// Un solo string literal (sin concatenar con `+`): supabase-js infiere el tipo de fila leyendo
// el literal exacto, y `+` lo ampliaría a `string` genérico, perdiendo esa inferencia.
const COLUMNAS_FEED =
  'id, autor_id, padre_id, texto, creado_en, estado, motivo_rechazo, fijado_en, fijado_hasta, fijado_por, reacciones(usuario_id), respuestas:mensajes!padre_id(id, autor_id, padre_id, texto, creado_en, estado, motivo_rechazo, fijado_en, fijado_hasta, fijado_por)'

type Cliente = SupabaseClient<Database>

/**
 * Todas las respuestas de una publicación, de a MAXIMO_FILAS_API y avanzando por id: sin saltear ni repetir
 * aunque se agreguen o borren respuestas entre un pedido y otro. El orden del hilo lo pone armarFeed.
 */
async function todasLasRespuestas(supabase: Cliente, padreId: string): Promise<MensajeFila[]> {
  const respuestas: MensajeFila[] = []
  for (;;) {
    let consulta = supabase
      .from('mensajes')
      .select('id, autor_id, padre_id, texto, creado_en, estado, motivo_rechazo, fijado_en, fijado_hasta, fijado_por')
      .eq('padre_id', padreId)
    const ultima = respuestas.at(-1)
    if (ultima) consulta = consulta.gt('id', ultima.id)
    const { data, error } = await consulta.order('id', { ascending: true }).limit(MAXIMO_FILAS_API)
    if (error) throw error
    respuestas.push(...data)
    if (data.length < MAXIMO_FILAS_API) return respuestas
  }
}

/** Completa aparte las listas de respuestas que PostgREST pudo haber cortado. */
function completarRespuestas(supabase: Cliente, filas: PublicacionFila[]): Promise<PublicacionFila[]> {
  return Promise.all(
    filas.map(async (fila) =>
      fila.respuestas.length < MAXIMO_FILAS_API
        ? fila
        : { ...fila, respuestas: await todasLasRespuestas(supabase, fila.id) },
    ),
  )
}

/**
 * Publicaciones fijadas vigentes a `ahora` (reloj del servidor), la última fijada primero. El navegador
 * vuelve a mirar el vencimiento con su reloj mientras la página está abierta (lib/mensajes/fijados.ts).
 */
export async function consultarFijadas(supabase: Cliente, ahora: Date): Promise<Publicacion[]> {
  const { data: filas, error } = await supabase
    .from('mensajes')
    .select(COLUMNAS_FEED)
    .is('padre_id', null)
    .not('fijado_en', 'is', null)
    .or(`fijado_hasta.is.null,fijado_hasta.gt.${ahora.toISOString()}`)
    .order('fijado_en', { ascending: false })
    .order('creado_en', { referencedTable: 'respuestas', ascending: true })
    .order('id', { referencedTable: 'respuestas', ascending: true })
    .limit(MAXIMO_FIJADAS)
  if (error) throw error
  return armarFeed(await completarRespuestas(supabase, filas))
}

/**
 * Las TAMANO_PAGINA publicaciones más recientes (o anteriores a `antesDe`), con sus respuestas y reacciones;
 * en la primera página, también las fijadas vigentes. `antesDe` se usa tal como vino de la base (con
 * microsegundos); ver decisión de diseño 7.
 * Recibe el cliente para que la prueba de integración ejecute exactamente esta consulta (sin 'server-only').
 */
export async function consultarPaginaFeed(
  supabase: Cliente,
  antesDe: string | null,
  ahora: Date = new Date(),
): Promise<PaginaFeed> {
  let consulta = supabase.from('mensajes').select(COLUMNAS_FEED).is('padre_id', null)
  if (antesDe) consulta = consulta.lt('creado_en', antesDe)
  const [pagina, fijadas] = await Promise.all([
    consulta
      .order('creado_en', { ascending: false })
      .order('id', { ascending: false })
      .order('creado_en', { referencedTable: 'respuestas', ascending: true })
      .order('id', { referencedTable: 'respuestas', ascending: true })
      .limit(TAMANO_PAGINA + 1),
    antesDe ? Promise.resolve([]) : consultarFijadas(supabase, ahora),
  ])
  if (pagina.error) throw pagina.error
  const filas = pagina.data

  const publicaciones = armarFeed(await completarRespuestas(supabase, filas.slice(0, TAMANO_PAGINA)))
  return {
    publicaciones,
    fijadas,
    hayMas: filas.length > TAMANO_PAGINA,
    cursor: cursorAnteriores(publicaciones),
  }
}
