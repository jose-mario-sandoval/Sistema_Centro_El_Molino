import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { variableEntorno } from '@/lib/entorno'
import type { Database } from './database.types'

/**
 * Llave secreta: solo en el servidor y después de verificar permisos. La única excepción es el
 * login (app/login/acciones.ts), que todavía no tiene sesión: la usa solo para buscar la dirección
 * de Auth del usuario escrito (lib/cuentas/direccion-de-acceso.ts), y nada de eso vuelve al navegador.
 */
export function crearClienteAdmin() {
  return createClient<Database>(
    variableEntorno('NEXT_PUBLIC_SUPABASE_URL'),
    variableEntorno('SUPABASE_SECRET_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
