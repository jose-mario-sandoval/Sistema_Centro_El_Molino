'use server'

import { redirect } from 'next/navigation'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError, esquemaLogin } from '@/lib/validacion/auth'

export async function iniciarSesion(_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> {
  const entrada = esquemaLogin.safeParse({
    correo: formData.get('correo'),
    contrasena: formData.get('contrasena'),
  })
  if (!entrada.success) return fallo('Revisá los datos.', camposConError(entrada.error))

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: entrada.data.correo,
    password: entrada.data.contrasena,
  })
  if (error || !data.user) {
    if (error?.code === 'user_banned') return fallo('Tu cuenta está desactivada. Hablá con el Director.')
    return fallo('Correo o contraseña incorrectos.')
  }

  const { data: perfil, error: errorPerfil } = await supabase
    .from('perfiles')
    .select('activo, debe_cambiar_contrasena')
    .eq('id', data.user.id)
    .maybeSingle()

  // Un error de la base no significa cuenta desactivada: se conserva la sesión y se pide reintentar.
  if (errorPerfil) return fallo('No se pudo iniciar sesión. Intentá de nuevo.')

  if (!perfil || !perfil.activo) {
    // 'local': cierra solo esta sesión, sin invalidar las de otros dispositivos.
    await supabase.auth.signOut({ scope: 'local' })
    return fallo('Tu cuenta está desactivada. Hablá con el Director.')
  }

  redirect(perfil.debe_cambiar_contrasena ? '/cambiar-contrasena' : '/comidas/semana')
}
