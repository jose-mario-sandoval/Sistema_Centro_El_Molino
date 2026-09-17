'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { esquemaPreferenciasAvisos } from '@/lib/validacion/push'

/** Preferencias de avisos de la propia cuenta: cliente admin después de perfilParaAccion() (spec §2). */
export async function actualizarPreferenciasAvisos(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion()
  if (!permiso.ok) return permiso

  const datos = esquemaPreferenciasAvisos.safeParse(entrada)
  if (!datos.success) return fallo('Las preferencias no son válidas.')

  const { error } = await crearClienteAdmin()
    .from('perfiles')
    .update({
      avisar_hora_limite: datos.data.avisarHoraLimite,
      avisar_mensajes: datos.data.avisarMensajes,
    })
    .eq('id', permiso.perfil.id)
  if (error) {
    console.error('actualizarPreferenciasAvisos', error)
    return fallo('No se pudieron guardar tus preferencias. Intentá de nuevo.')
  }

  revalidatePath('/configuraciones')
  return exito(null)
}
