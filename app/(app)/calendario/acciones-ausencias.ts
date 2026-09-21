'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { fechaISOEn } from '@/lib/fechas'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'
import { esquemaAusencia, esquemaQuitarAusencia } from '@/lib/validacion/ausencias'

/**
 * Cada Director o Residente marca sus propias ausencias. RLS lo vuelve a exigir en la base.
 * Sus comidas de esos días se cancelan solas: por eso se revalida también Comidas.
 */
export async function marcarAusencia(_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director', 'residente')
  if (!permiso.ok) return permiso

  const entrada = esquemaAusencia.safeParse({ desde: formData.get('desde'), hasta: formData.get('hasta') })
  if (!entrada.success) return fallo('Revisá las fechas.', camposConError(entrada.error))

  // Una ausencia que ya pasó por completo no cambia nada; la base también lo rechaza.
  if (entrada.data.hasta < fechaISOEn(new Date())) {
    return fallo('Revisá las fechas.', { hasta: 'Ese período ya pasó por completo.' })
  }

  const supabase = await crearClienteServidor()
  const { error } = await supabase.from('ausencias').insert({ usuario_id: permiso.perfil.id, ...entrada.data })
  if (error) return fallo('No se pudo guardar la ausencia. Intentá de nuevo.')

  revalidatePath('/calendario')
  revalidatePath('/comidas', 'layout')
  return exito(null)
}

export async function quitarAusencia(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director', 'residente')
  if (!permiso.ok) return permiso

  const datos = esquemaQuitarAusencia.safeParse(entrada)
  if (!datos.success) return fallo('Ausencia inválida.')

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('ausencias').delete().eq('id', datos.data.id).select('id')
  if (error) return fallo('No se pudo quitar la ausencia. Intentá de nuevo.')
  // RLS no da error si no hay filas afectadas: 0 filas = ya no existe (o no era suya).
  if (data.length === 0) {
    revalidatePath('/calendario')
    return fallo('Esa ausencia ya no existe.')
  }

  revalidatePath('/calendario')
  revalidatePath('/comidas', 'layout')
  return exito(null)
}
