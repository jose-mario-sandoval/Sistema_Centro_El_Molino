import 'server-only'
import type { Ausencia } from '@/lib/ausencias/tipos'
import type { FechaISO } from '@/lib/fechas'
import { crearClienteServidor } from '@/lib/supabase/servidor'

/**
 * Ausencias propias que todavía cuentan (hasta hoy o después), las más próximas primero.
 * La política de la tabla solo deja ver las propias: nadie conoce las ausencias de otra persona.
 */
export async function listarMisAusencias(hoy: FechaISO): Promise<Ausencia[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('ausencias')
    .select('id, desde, hasta')
    .gte('hasta', hoy)
    .order('desde')
    .order('hasta')
  if (error) throw error
  return data
}
