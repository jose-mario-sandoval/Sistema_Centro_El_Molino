import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import type { Tabla } from '@/lib/supabase/tipos'

export const LIMITE_REGISTRO = 20
export type EntradaRegistro = Tabla<'registro_moderacion'>
export type CursorRegistro = { eliminadoEn: string; id: string }
export type PaginaRegistro = { entradas: EntradaRegistro[]; hayMas: boolean; cursor: CursorRegistro | null }

/**
 * Fecha e id juntos: varias eliminaciones pueden tener el mismo instante. Se conserva la fecha
 * exacta de Postgres (con microsegundos), sin pasar por Date ni usar offsets que cambian al borrar filas.
 * RLS limita la lectura al Director y excluye las entradas que ya cumplieron tres meses.
 */
export async function consultarRegistroModeracion(
  supabase: SupabaseClient<Database>,
  antesDe: CursorRegistro | null = null,
): Promise<PaginaRegistro> {
  let consulta = supabase
    .from('registro_moderacion')
    .select('id, moderador_id, autor_id, texto_eliminado, era_respuesta, eliminado_en')
  if (antesDe) {
    consulta = consulta.or(
      `eliminado_en.lt.${antesDe.eliminadoEn},and(eliminado_en.eq.${antesDe.eliminadoEn},id.lt.${antesDe.id})`,
    )
  }
  const { data, error } = await consulta
    .order('eliminado_en', { ascending: false })
    .order('id', { ascending: false })
    .limit(LIMITE_REGISTRO + 1)
  if (error) throw error

  const entradas = data.slice(0, LIMITE_REGISTRO)
  const hayMas = data.length > LIMITE_REGISTRO
  const ultima = entradas.at(-1)
  return {
    entradas,
    hayMas,
    cursor: hayMas && ultima ? { eliminadoEn: ultima.eliminado_en, id: ultima.id } : null,
  }
}
