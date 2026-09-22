import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { variableEntorno } from '@/lib/entorno'
import type { Database } from './database.types'

/**
 * Cliente sin sesión: para la página pública de confirmación de cena extra. Nunca persiste ni
 * refresca sesión — quien la usa no tiene cuenta.
 */
export function crearClientePublico() {
  return createClient<Database>(
    variableEntorno('NEXT_PUBLIC_SUPABASE_URL'),
    variableEntorno('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
