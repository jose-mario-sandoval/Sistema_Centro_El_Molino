import 'server-only'
import { exigirRol } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { leerPaginasPensiones } from './paginacion'
import type { ConfiguracionDonacion, MesDonacion } from './donaciones'

export async function obtenerConfiguracionDonacion(): Promise<ConfiguracionDonacion[]> {
  await exigirRol('director')
  const supabase = await crearClienteServidor()
  return leerPaginasPensiones((desde, hasta) => supabase.from('pensiones_donaciones_configuracion')
    .select('desde, monto_centavos').order('desde', { ascending: false }).range(desde, hasta))
}

export async function obtenerDonaciones(anio: number): Promise<MesDonacion[]> {
  await exigirRol('director')
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('donaciones_pensiones', { p_anio: anio })
  if (error) throw error
  return data
}
