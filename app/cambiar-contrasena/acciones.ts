'use server'

import { redirect } from 'next/navigation'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { obtenerPerfilActual } from '@/lib/auth/sesion'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError, esquemaContrasenaNueva } from '@/lib/validacion/auth'

export async function cambiarContrasenaObligatoria(
  _previo: Resultado<null> | null,
  formData: FormData,
): Promise<Resultado<null>> {
  const perfil = await obtenerPerfilActual()
  if (!perfil) redirect('/login')
  // Sin contraseña temporal pendiente, este atajo no aplica (el cambio normal pide la actual, pista 05).
  if (!perfil.debe_cambiar_contrasena) redirect('/comidas/semana')

  const entrada = esquemaContrasenaNueva.safeParse({
    nueva: formData.get('nueva'),
    confirmacion: formData.get('confirmacion'),
  })
  if (!entrada.success) return fallo('Revisá los datos.', camposConError(entrada.error))

  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.updateUser({ password: entrada.data.nueva })
  if (error) {
    if (error.code === 'same_password') return fallo('La contraseña nueva debe ser distinta de la temporal.')
    if (error.code === 'weak_password') return fallo('La contraseña es demasiado débil. Probá con una más larga.')
    return fallo('No se pudo cambiar la contraseña. Intentá de nuevo.')
  }

  const { error: errorPerfil } = await crearClienteAdmin()
    .from('perfiles')
    .update({ debe_cambiar_contrasena: false })
    .eq('id', perfil.id)
  if (errorPerfil) return fallo('La contraseña se cambió, pero no se pudo actualizar tu cuenta. Intentá de nuevo.')

  redirect('/comidas/semana')
}
