import type { SupabaseClient } from '@supabase/supabase-js'
import { direccionInterna, esDireccionInterna } from '@/lib/cuentas/usuario'
import type { Database } from '@/lib/supabase/database.types'

/*
 * Quitar de Supabase Auth el correo real de las cuentas que se crearon cuando se entraba con correo
 * (spec 2026-10-05 §3, "Borrar los correos"). La persona entra con su usuario y el login busca la
 * dirección de su cuenta, así que cambiarla no le cambia nada: ni la contraseña ni la sesión abierta.
 *
 * Con la API de administración de Auth (la misma llamada con la que antes se cambiaba un correo en
 * "Mi cuenta"), no con SQL sobre el esquema `auth`: así Auth actualiza también la identidad de correo.
 */

type Admin = SupabaseClient<Database>

const POR_PAGINA = 1000

/** Ids de las cuentas de Auth cuya dirección todavía es un correo de verdad. */
export async function cuentasConCorreo(admin: Admin): Promise<string[]> {
  const ids: string[] = []
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: POR_PAGINA })
    if (error) throw error
    for (const cuenta of data.users) if (!esDireccionInterna(cuenta.email)) ids.push(cuenta.id)
    if (data.users.length < POR_PAGINA) return ids
  }
}

export type ResultadoBorrarCorreo = 'cambiada' | 'ya-interna'

/**
 * Le pone a una cuenta una dirección interna nueva. Idempotente: si ya la tiene, no toca nada.
 * `email_confirm`: sin eso Auth dejaría el cambio pendiente de un correo de confirmación que nadie
 * puede recibir.
 */
export async function pasarADireccionInterna(admin: Admin, id: string): Promise<ResultadoBorrarCorreo> {
  const { data, error } = await admin.auth.admin.getUserById(id)
  if (error) throw error
  if (esDireccionInterna(data.user.email)) return 'ya-interna'

  const { error: errorCambio } = await admin.auth.admin.updateUserById(id, { email: direccionInterna(), email_confirm: true })
  if (errorCambio) throw errorCambio
  return 'cambiada'
}
