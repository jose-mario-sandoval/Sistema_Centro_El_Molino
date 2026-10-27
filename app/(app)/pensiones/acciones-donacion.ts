'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { mesActual } from '@/lib/pensiones/calculos'
import { esquemaConfiguracionDonacion, esquemaRecibirDonacion } from '@/lib/pensiones/donaciones'
import { ETIQUETA_DONACIONES } from '@/lib/pensiones/etiquetas'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'

export async function guardarDonacionPension(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso
  const datos = esquemaConfiguracionDonacion.safeParse(entrada)
  if (!datos.success) return fallo(`Revisá los datos de ${ETIQUETA_DONACIONES.toLocaleLowerCase('es')}.`, camposConError(datos.error))
  if (datos.data.desde < mesActual()) return fallo('El monto de ingresos por donaciones debe entrar en vigor este mes o en un mes futuro.')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('guardar_donacion_pension', {
    p_desde: datos.data.desde, p_monto_centavos: datos.data.monto,
  })
  if (error) return fallo('No se pudo guardar el monto de ingresos por donaciones. Recargá e intentá de nuevo.')
  revalidatePath('/pensiones', 'layout')
  return exito(null)
}

export async function recibirDonacionPension(entrada: unknown): Promise<Resultado<{ nueva: boolean }>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso
  const datos = esquemaRecibirDonacion.safeParse(entrada)
  if (!datos.success) return fallo('Elegí un mes con ingresos por donaciones configurados y un monto válido.')
  const supabase = await crearClienteServidor()
  // SQL calcula el monto y el autor. El esperado solo detecta una pantalla desactualizada.
  const { data, error } = await supabase.rpc('recibir_donacion_pension', {
    p_periodo: datos.data.periodo, p_monto_esperado: datos.data.monto_esperado,
  })
  if (error || !data?.length) return fallo('No se registró el envío del dinero de donaciones a la administración. El monto pudo cambiar o faltar. Recargá y revisalo antes de confirmar.')
  revalidatePath('/pensiones', 'layout')
  return exito({ nueva: data[0].nueva })
}
