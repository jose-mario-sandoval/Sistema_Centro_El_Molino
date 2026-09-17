import type { SupabaseClient } from '@supabase/supabase-js'
import { armarFeed, TAMANO_PAGINA, type Publicacion } from '@/lib/mensajes/feed'
import type { Database } from '@/lib/supabase/database.types'

export type PaginaFeed = { publicaciones: Publicacion[]; hayMas: boolean }

/**
 * Una sola consulta con recursos embebidos: `max_rows` (1000) limita solo las filas del nivel superior
 * (TAMANO_PAGINA + 1). Con consultas `.in()` aparte para respuestas y reacciones, una página con más de
 * 1000 de ellas se cortaba sin ningún error.
 * `mensajes!padre_id`: en una FK a la misma tabla, PostgREST elige el lado uno-a-muchos (las respuestas).
 */
const COLUMNAS_FEED =
  'id, autor_id, padre_id, texto, creado_en, reacciones(usuario_id), respuestas:mensajes!padre_id(id, autor_id, padre_id, texto, creado_en)'

/**
 * Las TAMANO_PAGINA publicaciones más recientes (o anteriores a `antesDe`), con sus respuestas y reacciones.
 * `antesDe` se usa tal como vino de la base (con microsegundos); ver decisión de diseño 7.
 * Recibe el cliente para que la prueba de integración ejecute exactamente esta consulta (sin 'server-only').
 */
export async function consultarPaginaFeed(
  supabase: SupabaseClient<Database>,
  antesDe: string | null,
): Promise<PaginaFeed> {
  let consulta = supabase.from('mensajes').select(COLUMNAS_FEED).is('padre_id', null)
  if (antesDe) consulta = consulta.lt('creado_en', antesDe)
  const { data: filas, error } = await consulta
    .order('creado_en', { ascending: false })
    .order('id', { ascending: false })
    .order('creado_en', { referencedTable: 'respuestas', ascending: true })
    .order('id', { referencedTable: 'respuestas', ascending: true })
    .limit(TAMANO_PAGINA + 1)
  if (error) throw error

  return {
    publicaciones: armarFeed(filas.slice(0, TAMANO_PAGINA)),
    hayMas: filas.length > TAMANO_PAGINA,
  }
}
