import type { SupabaseClient } from '@supabase/supabase-js'
import { crearCuenta } from '@/lib/cuentas/crear-cuenta'
import type { Rol } from '@/lib/perfiles/roles'
import type { Database } from '@/lib/supabase/database.types'
import { CONTRASENA_DEMO, DOMINIO_DEMO, type ClaveDemo, type UsuariosDemo } from './tipos'

const CUENTAS: Record<ClaveDemo, { nombre: string; siglas: string; rol: Rol }> = {
  director: { nombre: 'María Fernández (demo)', siglas: 'MF', rol: 'director' },
  sacerdote: { nombre: 'P. Antonio Ruiz (demo)', siglas: 'AR', rol: 'residente' },
  numerario: { nombre: 'Carlos Gómez (demo)', siglas: 'CG', rol: 'residente' },
  residente: { nombre: 'Juan Pérez (demo)', siglas: 'JP', rol: 'residente' },
  administracion: { nombre: 'Ana Torres (demo)', siglas: 'AT', rol: 'administracion' },
}

/** Crea (si faltan) las cuentas demo y devuelve sus ids. Idempotente. */
export async function asegurarUsuariosDemo(admin: SupabaseClient<Database>): Promise<UsuariosDemo> {
  const ids = {} as UsuariosDemo
  for (const [clave, cuenta] of Object.entries(CUENTAS) as [ClaveDemo, (typeof CUENTAS)[ClaveDemo]][]) {
    const correo = `${clave}@${DOMINIO_DEMO}`
    const { data: existente } = await admin.from('perfiles').select('id').eq('correo', correo).maybeSingle()
    if (existente) {
      ids[clave] = existente.id
      continue
    }
    const resultado = await crearCuenta(admin, {
      ...cuenta,
      correo,
      contrasena: CONTRASENA_DEMO,
      debeCambiarContrasena: false,
    })
    if (!resultado.ok) throw new Error(`${correo}: ${resultado.error}`)
    ids[clave] = resultado.id
    console.log(`  cuenta creada: ${correo}`)
  }
  return ids
}
