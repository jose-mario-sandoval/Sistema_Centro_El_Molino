'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { mesActual } from '@/lib/pensiones/calculos'
import { ROLES_PAGO } from '@/lib/pensiones/permisos'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'
import { esquemaCuotaPension, esquemaMarcarPensiones } from '@/lib/validacion/pensiones'

export async function guardarCuotaPension(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso
  const datos = esquemaCuotaPension.safeParse(entrada)
  if (!datos.success) return fallo('Revisá los datos de la cuota.', camposConError(datos.error))
  if (datos.data.desde < mesActual()) return fallo('La cuota debe entrar en vigor este mes o en un mes futuro.')
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('guardar_cuota_pension', {
    p_usuario_id: datos.data.usuario_id,
    p_desde: datos.data.desde,
    p_categoria: datos.data.categoria,
    p_monto_centavos: datos.data.monto,
  })
  if (error) return fallo('No se pudo guardar la cuota. Verificá que la cuenta siga activa e intentá de nuevo.')
  revalidatePath('/pensiones', 'layout')
  return exito(null)
}

export async function marcarPensiones(entrada: unknown): Promise<Resultado<{ cantidad: number }>> {
  const permiso = await perfilParaAccion(...ROLES_PAGO)
  if (!permiso.ok) return permiso
  const datos = esquemaMarcarPensiones.safeParse(entrada)
  if (!datos.success) return fallo('Elegí entre uno y doce meses con algo pendiente y un monto válido.')
  const supabase = await crearClienteServidor()
  // No se envía usuario ni categoría. SQL calcula los importes; montos solo evita confirmar
  // un total obsoleto si el Director cambió la cuota mientras se revisaba la selección.
  const { data, error } = await supabase.rpc('marcar_pensiones', {
    p_periodos: datos.data.periodos,
    p_montos_esperados: datos.data.montos,
    // Solo con pagos parciales: sin `abonos`, SQL paga todo lo que falta de cada mes.
    ...(datos.data.pagados && { p_pagados_esperados: datos.data.pagados }),
    ...(datos.data.abonos && { p_abonos: datos.data.abonos }),
  })
  if (error) return fallo('No se registraron los pagos. Una cuota o lo ya pagado pudo cambiar, o el monto superar lo que falta. Recargá y revisá los meses antes de confirmar.')
  revalidatePath('/pensiones', 'layout')
  return exito({ cantidad: data.length })
}
