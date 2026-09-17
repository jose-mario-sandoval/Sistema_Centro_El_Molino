import type { SupabaseClient } from '@supabase/supabase-js'
import type { Rol } from '@/lib/perfiles/roles'
import type { Database } from '@/lib/supabase/database.types'

export type DatosCuenta = {
  nombre: string
  siglas: string
  correo: string
  rol: Rol
  contrasena: string
  debeCambiarContrasena: boolean
}

export type ResultadoCrearCuenta = { ok: true; id: string } | { ok: false; error: string }

/** Crea usuario de Auth (confirmado) + perfil. Si el perfil falla, borra el usuario (spec §4). */
export async function crearCuenta(admin: SupabaseClient<Database>, datos: DatosCuenta): Promise<ResultadoCrearCuenta> {
  const correo = datos.correo.trim().toLowerCase()

  const { data, error } = await admin.auth.admin.createUser({
    email: correo,
    password: datos.contrasena,
    email_confirm: true,
  })
  if (error || !data.user) {
    const repetido = error?.code === 'email_exists'
    return { ok: false, error: repetido ? 'Ya existe una cuenta con ese correo.' : 'No se pudo crear la cuenta.' }
  }

  const { error: errorPerfil } = await admin.from('perfiles').insert({
    id: data.user.id,
    nombre: datos.nombre.trim(),
    siglas: datos.siglas.trim().toUpperCase(),
    correo,
    rol: datos.rol,
    debe_cambiar_contrasena: datos.debeCambiarContrasena,
  })
  if (errorPerfil) {
    await admin.auth.admin.deleteUser(data.user.id)
    return { ok: false, error: 'No se pudo crear el perfil de la cuenta.' }
  }

  return { ok: true, id: data.user.id }
}
