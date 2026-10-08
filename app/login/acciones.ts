'use server'

import { redirect } from 'next/navigation'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { direccionDeAcceso } from '@/lib/cuentas/direccion-de-acceso'
import { usuarioParaEntrar } from '@/lib/cuentas/usuario'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError, esquemaLogin } from '@/lib/validacion/auth'

export async function iniciarSesion(_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> {
  const entrada = esquemaLogin.safeParse({
    usuario: formData.get('usuario'),
    contrasena: formData.get('contrasena'),
  })
  if (!entrada.success) return fallo('Revisá los datos.', camposConError(entrada.error))

  // Auth conoce cada cuenta por una dirección que nadie escribe: se busca con la llave secreta (el
  // único uso sin sesión: solo esta búsqueda, y nada de ella vuelve al navegador). Un usuario que no
  // existe recibe una dirección que no es de nadie y sigue el mismo camino.
  let direccion
  try {
    direccion = await direccionDeAcceso(crearClienteAdmin(), usuarioParaEntrar(entrada.data.usuario))
  } catch (error) {
    // Sin la llave secreta configurada no se puede buscar a nadie: se dice, en vez de romper la página.
    console.error('iniciarSesion: no se pudo buscar la dirección de acceso', error)
    return fallo('No se pudo iniciar sesión. Intentá de nuevo.')
  }
  if (!direccion.ok) return fallo('No se pudo iniciar sesión. Intentá de nuevo.')

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: direccion.correo,
    password: entrada.data.contrasena,
  })
  if (error || !data.user) {
    if (error?.code === 'user_banned') return fallo('Tu cuenta está desactivada. Hablá con el Director.')
    return fallo('Usuario o contraseña incorrectos.')
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
