import type { SupabaseClient } from '@supabase/supabase-js'
import { MENSAJE_CORREO_REPETIDO } from '@/lib/configuraciones/errores'
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
    // Se registra el error original (logs de Vercel o consola del script); al usuario le llega un mensaje simple.
    console.error('crearCuenta: Auth no creó el usuario', error)
    const repetido = error?.code === 'email_exists'
    return { ok: false, error: repetido ? MENSAJE_CORREO_REPETIDO : 'No se pudo crear la cuenta.' }
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
    console.error('crearCuenta: no se pudo insertar el perfil', errorPerfil)
    const { error: errorBorrado } = await admin.auth.admin.deleteUser(data.user.id)
    if (errorBorrado) {
      // Queda un usuario de Auth sin perfil: hay que borrarlo a mano desde el panel de Supabase.
      console.error(`crearCuenta: no se pudo borrar el usuario de Auth sin perfil (id ${data.user.id})`, errorBorrado)
    }
    return { ok: false, error: 'No se pudo crear el perfil de la cuenta.' }
  }

  return { ok: true, id: data.user.id }
}
