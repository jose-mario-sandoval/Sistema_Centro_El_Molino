import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { variableEntorno } from '@/lib/entorno'
import type { Database } from './database.types'

/** Llave secreta: solo en el servidor y después de verificar permisos. */
export function crearClienteAdmin() {
  return createClient<Database>(
    variableEntorno('NEXT_PUBLIC_SUPABASE_URL'),
    variableEntorno('SUPABASE_SECRET_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
