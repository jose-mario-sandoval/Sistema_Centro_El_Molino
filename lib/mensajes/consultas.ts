import 'server-only'
import { armarFeed, TAMANO_PAGINA, type Publicacion } from '@/lib/mensajes/feed'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import type { Tabla } from '@/lib/supabase/tipos'

export type PaginaFeed = { publicaciones: Publicacion[]; hayMas: boolean }
export type EntradaRegistro = Tabla<'registro_moderacion'>

/** Entradas del registro de moderación que se muestran (las más recientes). */
export const LIMITE_REGISTRO = 100

const COLUMNAS_MENSAJE = 'id, autor_id, padre_id, texto, creado_en'

/**
 * Las TAMANO_PAGINA publicaciones más recientes (o anteriores a `antesDe`), con sus respuestas y reacciones.
 * `antesDe` se usa tal como vino de la base (con microsegundos); ver decisión de diseño 7.
 */
export async function listarPublicaciones(antesDe: string | null = null): Promise<PaginaFeed> {
  const supabase = await crearClienteServidor()

  let consulta = supabase.from('mensajes').select(COLUMNAS_MENSAJE).is('padre_id', null)
  if (antesDe) consulta = consulta.lt('creado_en', antesDe)
  const { data: filas, error } = await consulta
    .order('creado_en', { ascending: false })
    .order('id', { ascending: false })
    .limit(TAMANO_PAGINA + 1)
  if (error) throw error

  const hayMas = filas.length > TAMANO_PAGINA
  const publicaciones = filas.slice(0, TAMANO_PAGINA)
  if (publicaciones.length === 0) return { publicaciones: [], hayMas: false }

  const ids = publicaciones.map((p) => p.id)
  const [respuestas, reacciones] = await Promise.all([
    supabase.from('mensajes').select(COLUMNAS_MENSAJE).in('padre_id', ids),
    supabase.from('reacciones').select('mensaje_id, usuario_id').in('mensaje_id', ids),
  ])
  if (respuestas.error) throw respuestas.error
  if (reacciones.error) throw reacciones.error

  return { publicaciones: armarFeed([...publicaciones, ...respuestas.data], reacciones.data), hayMas }
}

/** Solo devuelve filas al Director (RLS); la página además verifica el rol. */
export async function listarRegistroModeracion(): Promise<EntradaRegistro[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('registro_moderacion')
    .select('id, moderador_id, autor_id, texto_eliminado, era_respuesta, eliminado_en')
    .order('eliminado_en', { ascending: false })
    .limit(LIMITE_REGISTRO)
  if (error) throw error
  return data
}
