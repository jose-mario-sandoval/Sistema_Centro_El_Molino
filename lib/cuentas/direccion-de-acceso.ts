import type { SupabaseClient } from '@supabase/supabase-js'
import { DIRECCION_INEXISTENTE } from '@/lib/cuentas/usuario'
import type { Database } from '@/lib/supabase/database.types'

export type DireccionDeAcceso = { ok: true; correo: string } | { ok: false }

/**
 * La dirección con la que Supabase Auth conoce a la cuenta de `usuario` (ya normalizado). Necesita
 * la llave secreta: nadie más puede leer direcciones de Auth.
 *
 * Si el usuario no existe devuelve una dirección que no es de nadie, no un error: así quien llama
 * intenta entrar igual y responde lo mismo que con una contraseña equivocada, sin revelar qué
 * usuarios existen. `ok: false` es solo "no se pudo consultar".
 */
export async function direccionDeAcceso(admin: SupabaseClient<Database>, usuario: string): Promise<DireccionDeAcceso> {
  const { data: perfil, error } = await admin.from('perfiles').select('id').eq('usuario', usuario).maybeSingle()
  if (error) {
    console.error('direccionDeAcceso: no se pudo buscar el usuario', error)
    return { ok: false }
  }
  if (!perfil) return { ok: true, correo: DIRECCION_INEXISTENTE }

  const { data, error: errorAuth } = await admin.auth.admin.getUserById(perfil.id)
  if (errorAuth) {
    // Un perfil sin cuenta de Auth no debería existir (on delete cascade); cualquier otro error es de consulta.
    if (errorAuth.status === 404) return { ok: true, correo: DIRECCION_INEXISTENTE }
    console.error(`direccionDeAcceso: Auth no devolvió la cuenta (usuario ${perfil.id})`, errorAuth)
    return { ok: false }
  }
  return { ok: true, correo: data.user?.email ?? DIRECCION_INEXISTENTE }
}
