import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export function crearClienteScript() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const llave = process.env.SUPABASE_SECRET_KEY
  if (!url || !llave) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY en .env.local')
    process.exit(1)
  }
  return createClient<Database>(url, llave, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function exigirConfirmacion(descripcion: string) {
  if (!process.argv.includes('--confirmar')) {
    console.error(`${descripcion}\nEsto modifica el proyecto de Supabase configurado en .env.local.\nVolvé a ejecutar agregando: -- --confirmar`)
    process.exit(1)
  }
}
