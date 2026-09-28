import 'server-only'
import { consultarPaginaFeed, consultarPublicacion, type PaginaFeed } from '@/lib/mensajes/consulta-feed'
import type { MensajeFila, Publicacion } from '@/lib/mensajes/feed'
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

/** Una publicación completa con la sesión del usuario (RLS aplica); ver consultarPublicacion. */
export async function obtenerPublicacion(id: string): Promise<Publicacion | null> {
  return consultarPublicacion(await crearClienteServidor(), id)
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

/** Cola de moderación del Director: los mensajes que esperan aprobación, más viejos primero. */
export async function listarMensajesPendientes(): Promise<MensajeFila[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('mensajes')
    .select('id, autor_id, padre_id, texto, creado_en, estado, motivo_rechazo, fijado_en, fijado_hasta, fijado_por')
    .eq('estado', 'pendiente')
    .order('creado_en')
  if (error) throw error
  return data
}

/**
 * Cuántos mensajes esperan aprobación: el globito del Director (components/app/pendientes.tsx). Solo el
 * Director ve los pendientes ajenos (RLS); a otro rol le contaría únicamente los propios.
 */
export async function contarMensajesPendientes(): Promise<number> {
  const supabase = await crearClienteServidor()
  const { count, error } = await supabase
    .from('mensajes')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente')
  if (error) throw error
  return count ?? 0
}
