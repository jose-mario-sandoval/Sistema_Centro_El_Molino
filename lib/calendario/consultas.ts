import 'server-only'
import { rangoCuadricula, type MesISO } from '@/lib/calendario/cuadricula'
import { eventoParaAdministracion, type Evento } from '@/lib/calendario/tipos'
import type { Rol } from '@/lib/perfiles/roles'
import { crearClienteServidor } from '@/lib/supabase/servidor'

/**
 * Eventos de los 42 días de la cuadrícula del mes: sin hora primero, luego por hora y título.
 *
 * Administración no conoce de qué son los eventos: la base no le deja leer `eventos`, y aquí lee
 * solo `eventos_para_cocina` (los que piden algo, sin título ni tipo). Por eso el rol decide qué
 * consulta se hace; la restricción real la pone la base de datos.
 */
export async function listarEventosDeCuadricula(mes: MesISO, rol: Rol): Promise<Evento[]> {
  const { desde, hasta } = rangoCuadricula(mes)
  const supabase = await crearClienteServidor()

  if (rol === 'administracion') {
    const { data, error } = await supabase.rpc('eventos_para_cocina', { p_desde: desde, p_hasta: hasta })
    if (error) throw error
    return data.map(eventoParaAdministracion)
  }

  const { data, error } = await supabase
    .from('eventos')
    .select('id, titulo, fecha, hora, tipo, requiere_cocina')
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha')
    .order('hora', { nullsFirst: true })
    .order('titulo')
  if (error) throw error
  return data
}
