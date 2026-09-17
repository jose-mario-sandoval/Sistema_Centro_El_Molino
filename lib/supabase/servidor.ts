import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

export async function crearClienteServidor() {
  const almacen = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return almacen.getAll()
        },
        setAll(cookiesAGuardar) {
          try {
            cookiesAGuardar.forEach(({ name, value, options }) => almacen.set(name, value, options))
          } catch {
            // Llamado desde un Server Component: el proxy refresca la sesión.
          }
        },
      },
    },
  )
}
