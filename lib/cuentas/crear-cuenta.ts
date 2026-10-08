import type { SupabaseClient } from '@supabase/supabase-js'
import { MENSAJE_USUARIO_REPETIDO } from '@/lib/configuraciones/errores'
import { direccionInterna, normalizarUsuario } from '@/lib/cuentas/usuario'
import type { Rol } from '@/lib/perfiles/roles'
import type { Database } from '@/lib/supabase/database.types'

export type DatosCuenta = {
  nombre: string
  siglas: string
  /** Con lo que la persona va a entrar. Quien llama ya lo validó (formato y que no esté repetido). */
  usuario: string
  rol: Rol
  contrasena: string
  debeCambiarContrasena: boolean
}

export type ResultadoCrearCuenta = { ok: true; id: string } | { ok: false; error: string }

/**
 * Crea usuario de Auth (confirmado) + perfil. Si el perfil falla, borra el usuario (spec §4).
 * Auth exige un correo por cuenta: recibe una dirección interna que nadie ve ni escribe; la persona
 * entra con `usuario` (lib/cuentas/direccion-de-acceso.ts).
 */
export async function crearCuenta(admin: SupabaseClient<Database>, datos: DatosCuenta): Promise<ResultadoCrearCuenta> {
  const { data, error } = await admin.auth.admin.createUser({
    email: direccionInterna(),
    password: datos.contrasena,
    email_confirm: true,
  })
  if (error || !data.user) {
    // Se registra el error original (logs de Vercel o consola del script); al usuario le llega un mensaje simple.
    console.error('crearCuenta: Auth no creó el usuario', error)
    return { ok: false, error: 'No se pudo crear la cuenta.' }
  }

  const { error: errorPerfil } = await admin.from('perfiles').insert({
    id: data.user.id,
    nombre: datos.nombre.trim(),
    siglas: datos.siglas.trim().toUpperCase(),
    usuario: normalizarUsuario(datos.usuario),
    rol: datos.rol,
    debe_cambiar_contrasena: datos.debeCambiarContrasena,
  })
  if (errorPerfil) {
    // 23505: otra cuenta ya tiene ese usuario (lo rechaza la base aunque quien llama lo haya validado antes).
    const repetido = errorPerfil.code === '23505'
    if (!repetido) console.error('crearCuenta: no se pudo insertar el perfil', errorPerfil)
    const { error: errorBorrado } = await admin.auth.admin.deleteUser(data.user.id)
    if (errorBorrado) {
      // Queda un usuario de Auth sin perfil: hay que borrarlo a mano desde el panel de Supabase.
      console.error(`crearCuenta: no se pudo borrar el usuario de Auth sin perfil (id ${data.user.id})`, errorBorrado)
    }
    return { ok: false, error: repetido ? MENSAJE_USUARIO_REPETIDO : 'No se pudo crear el perfil de la cuenta.' }
  }

  return { ok: true, id: data.user.id }
}
