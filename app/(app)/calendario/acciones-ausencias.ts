'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { usuarioObjetivo } from '@/lib/comidas/permisos'
import { fechaISOEn } from '@/lib/fechas'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'
import { esquemaAusencia, esquemaQuitarAusencia } from '@/lib/validacion/ausencias'

/**
 * Cada Director o Residente marca sus ausencias; el Director también las de otra persona
 * (`usuarioId` en el formulario). RLS lo vuelve a exigir en la base.
 * Sus comidas de esos días se cancelan solas: por eso se revalida también Comidas.
 */
export async function marcarAusencia(_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director', 'residente')
  if (!permiso.ok) return permiso

  const entrada = esquemaAusencia.safeParse({
    desde: formData.get('desde'),
    hasta: formData.get('hasta'),
    // Sin campo (null) o vacío: la propia.
    usuarioId: formData.get('usuarioId') || undefined,
  })
  if (!entrada.success) return fallo('Revisá las fechas.', camposConError(entrada.error))

  const objetivo = usuarioObjetivo(permiso.perfil, entrada.data.usuarioId)
  if (!objetivo.ok) return fallo(objetivo.error)

  // Una ausencia que ya pasó por completo no cambia nada; la base también lo rechaza.
  if (entrada.data.hasta < fechaISOEn(new Date())) {
    return fallo('Revisá las fechas.', { hasta: 'Ese período ya pasó por completo.' })
  }

  const supabase = await crearClienteServidor()
  const { desde, hasta } = entrada.data
  const { error } = await supabase.from('ausencias').insert({ usuario_id: objetivo.usuarioId, desde, hasta })
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

  const objetivo = usuarioObjetivo(permiso.perfil, datos.data.usuarioId)
  if (!objetivo.ok) return fallo(objetivo.error)

  const supabase = await crearClienteServidor()
  // Por persona además de por id: el Director puede ver (y quitar) las de todos, y quitar desde su
  // propio panel no debe tocar la de otra persona aunque llegue su id.
  const { data, error } = await supabase
    .from('ausencias')
    .delete()
    .eq('id', datos.data.id)
    .eq('usuario_id', objetivo.usuarioId)
    .select('id')
  if (error) return fallo('No se pudo quitar la ausencia. Intentá de nuevo.')
  // RLS no da error si no hay filas afectadas: 0 filas = ya no existe (o no era de esa persona).
  if (data.length === 0) {
    revalidatePath('/calendario')
    return fallo('Esa ausencia ya no existe.')
  }

  revalidatePath('/calendario')
  revalidatePath('/comidas', 'layout')
  return exito(null)
}
