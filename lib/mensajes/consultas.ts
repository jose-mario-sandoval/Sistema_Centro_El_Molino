import 'server-only'
import { consultarPaginaFeed, type PaginaFeed } from '@/lib/mensajes/consulta-feed'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import type { Tabla } from '@/lib/supabase/tipos'

export type { PaginaFeed }
export type EntradaRegistro = Tabla<'registro_moderacion'>

/** Entradas del registro de moderación que se muestran (las más recientes). */
export const LIMITE_REGISTRO = 100

/** Página del feed con la sesión del usuario (RLS aplica); ver consultarPaginaFeed. */
export async function listarPublicaciones(antesDe: string | null = null): Promise<PaginaFeed> {
  return consultarPaginaFeed(await crearClienteServidor(), antesDe)
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
