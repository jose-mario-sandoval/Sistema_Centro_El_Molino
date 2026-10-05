import type { SupabaseClient } from '@supabase/supabase-js'
import { nombreAdministracion, siglasAdministracion, siguienteNumeroAdministracion } from '@/lib/cuentas/administracion'
import { crearCuenta } from '@/lib/cuentas/crear-cuenta'
import type { Rol } from '@/lib/perfiles/roles'
import type { Database } from '@/lib/supabase/database.types'
import { contrasenaDemo, usuarioDemo, type ClaveDemo, type UsuariosDemo } from './tipos'

const CUENTAS: Record<ClaveDemo, { nombre: string; siglas: string; rol: Rol }> = {
  director: { nombre: 'María Fernández (demo)', siglas: 'MF', rol: 'director' },
  sacerdote: { nombre: 'P. Antonio Ruiz (demo)', siglas: 'AR', rol: 'residente' },
  numerario: { nombre: 'Carlos Gómez (demo)', siglas: 'CG', rol: 'residente' },
  residente: { nombre: 'Juan Pérez (demo)', siglas: 'JP', rol: 'residente' },
  // La casa no ve el nombre real de Administración: al crearla recibe el genérico que sigue.
  administracion: { nombre: '', siglas: '', rol: 'administracion' },
}

/** "Administración N" / "AN": el número que sigue, como hace la app al crear una cuenta de ese rol. */
async function identidadDeAdministracion(admin: SupabaseClient<Database>) {
  const { data, error } = await admin.from('perfiles').select('nombre').like('nombre', 'Administración %')
  if (error) throw error
  const numero = siguienteNumeroAdministracion(data.map((fila) => fila.nombre))
  return { nombre: nombreAdministracion(numero), siglas: siglasAdministracion(numero) }
}

/**
 * Crea (si faltan) las cuentas demo y devuelve sus ids. Idempotente.
 * A las que ya existen les pone la contraseña actual de CONTRASENA_DEMO (permite rotarla).
 */
export async function asegurarUsuariosDemo(admin: SupabaseClient<Database>): Promise<UsuariosDemo> {
  const contrasena = contrasenaDemo()
  const ids = {} as UsuariosDemo
  for (const [clave, cuenta] of Object.entries(CUENTAS) as [ClaveDemo, (typeof CUENTAS)[ClaveDemo]][]) {
    const usuario = usuarioDemo(clave)
    const { data: existente, error } = await admin.from('perfiles').select('id').eq('usuario', usuario).maybeSingle()
    if (error) throw error
    if (existente) {
      const { error: errorContrasena } = await admin.auth.admin.updateUserById(existente.id, { password: contrasena })
      if (errorContrasena) throw new Error(`${usuario}: no se pudo actualizar la contraseña (${errorContrasena.message})`)
      ids[clave] = existente.id
      console.log(`  contraseña actualizada: ${usuario}`)
      continue
    }
    const identidad = cuenta.rol === 'administracion' ? await identidadDeAdministracion(admin) : cuenta
    const resultado = await crearCuenta(admin, {
      ...identidad,
      rol: cuenta.rol,
      usuario,
      contrasena,
      debeCambiarContrasena: false,
    })
    if (!resultado.ok) throw new Error(`${usuario}: ${resultado.error}`)
    ids[clave] = resultado.id
    console.log(`  cuenta creada: ${usuario}`)
  }
  return ids
}
