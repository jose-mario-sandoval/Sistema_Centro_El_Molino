'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import type { Tabla } from '@/lib/supabase/tipos'
import { esquemaPreferenciasAvisos } from '@/lib/validacion/push'

type ColumnasAvisos = Partial<
  Pick<Tabla<'perfiles'>, 'avisar_hora_limite' | 'avisar_mensajes' | 'avisar_cambios' | 'avisar_cocina'>
>

/**
 * Preferencias de avisos de la propia cuenta: cliente admin después de perfilParaAccion() (spec §2),
 * siempre sobre la fila de la sesión. Solo escribe lo que llega (los avisos nuevos son opcionales).
 */
export async function actualizarPreferenciasAvisos(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion()
  if (!permiso.ok) return permiso

  const datos = esquemaPreferenciasAvisos.safeParse(entrada)
  if (!datos.success) return fallo('Las preferencias no son válidas.')

  const { avisarHoraLimite, avisarMensajes, avisarCambios, avisarCocina } = datos.data
  const cambios: ColumnasAvisos = { avisar_hora_limite: avisarHoraLimite, avisar_mensajes: avisarMensajes }
  if (avisarCambios !== undefined) cambios.avisar_cambios = avisarCambios
  if (avisarCocina !== undefined) cambios.avisar_cocina = avisarCocina

  const { error } = await crearClienteAdmin().from('perfiles').update(cambios).eq('id', permiso.perfil.id)
  if (error) {
    console.error('actualizarPreferenciasAvisos', error)
    return fallo('No se pudieron guardar tus preferencias. Intentá de nuevo.')
  }

  revalidatePath('/configuraciones')
  return exito(null)
}
