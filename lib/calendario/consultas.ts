import 'server-only'
import { rangoCuadricula, type MesISO } from '@/lib/calendario/cuadricula'
import type { Evento } from '@/lib/calendario/tipos'
import { crearClienteServidor } from '@/lib/supabase/servidor'

/** Eventos de los 42 días de la cuadrícula del mes: sin hora primero, luego por hora y título. */
export async function listarEventosDeCuadricula(mes: MesISO): Promise<Evento[]> {
  const { desde, hasta } = rangoCuadricula(mes)
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('eventos')
    .select('id, titulo, fecha, hora')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha')
    .order('hora', { nullsFirst: true })
    .order('titulo')
  if (error) throw error
  return data
}
