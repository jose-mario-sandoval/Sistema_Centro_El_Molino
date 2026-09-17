import type { SupabaseClient } from '@supabase/supabase-js'
import { armarFeed, TAMANO_PAGINA, type MensajeFila, type Publicacion } from '@/lib/mensajes/feed'
import type { Database } from '@/lib/supabase/database.types'

export type PaginaFeed = { publicaciones: Publicacion[]; hayMas: boolean }

/**
 * Igual que `max_rows` de [api] en supabase/config.toml (producción lo recibe con `config push`; una prueba
 * unitaria verifica que coincidan). PostgREST corta ahí, sin avisar, las filas del nivel superior y también
 * cada lista embebida.
 */
export const MAXIMO_FILAS_API = 1000

/**
 * Una consulta con recursos embebidos para la página; solo una publicación con MAXIMO_FILAS_API respuestas o
 * más (lista posiblemente cortada) necesita pedidos aparte. Las reacciones no: hay a lo sumo una por persona.
 * `mensajes!padre_id`: en una FK a la misma tabla, PostgREST elige el lado uno-a-muchos (las respuestas).
 */
const COLUMNAS_FEED =
  'id, autor_id, padre_id, texto, creado_en, reacciones(usuario_id), respuestas:mensajes!padre_id(id, autor_id, padre_id, texto, creado_en)'

type Cliente = SupabaseClient<Database>

/**
 * Todas las respuestas de una publicación, de a MAXIMO_FILAS_API y avanzando por id: sin saltear ni repetir
 * aunque se agreguen o borren respuestas entre un pedido y otro. El orden del hilo lo pone armarFeed.
 */
async function todasLasRespuestas(supabase: Cliente, padreId: string): Promise<MensajeFila[]> {
  const respuestas: MensajeFila[] = []
  for (;;) {
    let consulta = supabase.from('mensajes').select('id, autor_id, padre_id, texto, creado_en').eq('padre_id', padreId)
    const ultima = respuestas.at(-1)
    if (ultima) consulta = consulta.gt('id', ultima.id)
    const { data, error } = await consulta.order('id', { ascending: true }).limit(MAXIMO_FILAS_API)
    if (error) throw error
    respuestas.push(...data)
    if (data.length < MAXIMO_FILAS_API) return respuestas
  }
}

/**
 * Las TAMANO_PAGINA publicaciones más recientes (o anteriores a `antesDe`), con sus respuestas y reacciones.
 * `antesDe` se usa tal como vino de la base (con microsegundos); ver decisión de diseño 7.
 * Recibe el cliente para que la prueba de integración ejecute exactamente esta consulta (sin 'server-only').
 */
export async function consultarPaginaFeed(supabase: Cliente, antesDe: string | null): Promise<PaginaFeed> {
  let consulta = supabase.from('mensajes').select(COLUMNAS_FEED).is('padre_id', null)
  if (antesDe) consulta = consulta.lt('creado_en', antesDe)
  const { data: filas, error } = await consulta
    .order('creado_en', { ascending: false })
    .order('id', { ascending: false })
    .order('creado_en', { referencedTable: 'respuestas', ascending: true })
    .order('id', { referencedTable: 'respuestas', ascending: true })
    .limit(TAMANO_PAGINA + 1)
  if (error) throw error

  const pagina = await Promise.all(
    filas.slice(0, TAMANO_PAGINA).map(async (fila) =>
      fila.respuestas.length < MAXIMO_FILAS_API
        ? fila
        : { ...fila, respuestas: await todasLasRespuestas(supabase, fila.id) },
    ),
  )

  return {
    publicaciones: armarFeed(pagina),
    hayMas: filas.length > TAMANO_PAGINA,
  }
}
