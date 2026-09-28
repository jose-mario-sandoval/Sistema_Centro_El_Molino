import 'server-only'
import { ausenciaDesdeFila, type Ausencia } from '@/lib/ausencias/tipos'
import type { FechaISO } from '@/lib/fechas'
import { crearClienteServidor } from '@/lib/supabase/servidor'

/**
 * Ausencias de una persona que todavía cuentan (hasta hoy o después), las más próximas primero.
 * Filtra por persona explícitamente: el Director puede leer las de todos (RLS), así que sin el
 * filtro su propio panel y los marcadores de su calendario mostrarían las de toda la casa.
 */
export async function listarAusenciasDe(usuarioId: string, hoy: FechaISO): Promise<Ausencia[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('ausencias')
    .select('id, desde, hasta, creado_por')
    .eq('usuario_id', usuarioId)
    .gte('hasta', hoy)
    .order('desde')
    .order('hasta')
  if (error) throw error
  return data.map(ausenciaDesdeFila)
}
