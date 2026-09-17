import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export const DOMINIO_DEMO = 'demo.test'

const LARGO_MINIMO_CONTRASENA_DEMO = 12

/**
 * Contraseña de las cuentas demo, leída de CONTRASENA_DEMO en .env.local.
 * No se commitea: el repo es público y las cuentas demo viven en el proyecto real.
 */
export function contrasenaDemo(): string {
  const contrasena = process.env.CONTRASENA_DEMO ?? ''
  if (contrasena.length < LARGO_MINIMO_CONTRASENA_DEMO) {
    console.error(
      `Falta CONTRASENA_DEMO en .env.local o tiene menos de ${LARGO_MINIMO_CONTRASENA_DEMO} caracteres.\n` +
        'Generá una con: node -e "console.log(require(\'node:crypto\').randomBytes(18).toString(\'base64url\'))"',
    )
    process.exit(1)
  }
  return contrasena
}

export type ClaveDemo = 'director' | 'sacerdote' | 'numerario' | 'residente' | 'administracion'
export type UsuariosDemo = Record<ClaveDemo, string>

export type Sembrador = (admin: SupabaseClient<Database>, usuarios: UsuariosDemo) => Promise<void>
