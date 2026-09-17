'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { crearClienteServidor } from '@/lib/supabase/servidor'

export async function cerrarSesion() {
  const supabase = await crearClienteServidor()
  // 'local': cierra solo este dispositivo; las demás sesiones del usuario siguen abiertas.
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) {
    // Si Auth falla, igual se borran las cookies de sesión para que el usuario salga de verdad.
    const almacen = await cookies()
    for (const { name } of almacen.getAll()) {
      if (name.startsWith('sb-')) almacen.delete(name)
    }
  }
  redirect('/login')
}
