import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { variableEntorno } from '@/lib/entorno'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Verifica la contraseña con un cliente sin persistencia de sesión (spec §4):
 * no lee ni escribe las cookies de la sesión abierta en el navegador.
 */
export async function verificarContrasena(correo: string, contrasena: string): Promise<boolean> {
  const verificador = createClient<Database>(
    variableEntorno('NEXT_PUBLIC_SUPABASE_URL'),
    variableEntorno('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )

  const { data, error } = await verificador.auth.signInWithPassword({ email: correo, password: contrasena })
  if (error || !data.session) return false

  // Cierra solo la sesión recién creada. El alcance por defecto ('global')
  // cerraría también la sesión del navegador de esta persona.
  await verificador.auth.signOut({ scope: 'local' })
  return true
}
