import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { cuentasConCorreo, pasarADireccionInterna } from '@/lib/cuentas/borrar-correo'
import { direccionDeAcceso } from '@/lib/cuentas/direccion-de-acceso'
import { esDireccionInterna } from '@/lib/cuentas/usuario'
import { clienteAdminPrueba } from '../soporte/usuarios-prueba'

/*
 * Borrar el correo de una cuenta contra el Auth real (spec 2026-10-05 §3). Con una cuenta
 * descartable creada como las de antes (con su correo en Auth): las cuentas de prueba compartidas
 * entran con su dirección fija y no se tocan.
 */

const admin = clienteAdminPrueba()
const USUARIO = 'cuenta.vieja'
const CORREO = 'cuenta-vieja@prueba.test'
const CONTRASENA = 'clave-de-cuenta-vieja-1'

function clienteSinSesion() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function crearCuentaVieja(): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({ email: CORREO, password: CONTRASENA, email_confirm: true })
  if (error) throw error
  const { error: errorPerfil } = await admin
    .from('perfiles')
    .insert({ id: data.user.id, nombre: 'Cuenta Vieja', siglas: 'CV', usuario: USUARIO, rol: 'residente' })
  if (errorPerfil) throw errorPerfil
  return data.user.id
}

afterEach(async () => {
  // Borrar el usuario de Auth borra su perfil (on delete cascade).
  const { data } = await admin.from('perfiles').select('id').eq('usuario', USUARIO)
  for (const { id } of data ?? []) await admin.auth.admin.deleteUser(id)
})

describe('borrar el correo de una cuenta', () => {
  it('la dirección pasa a ser interna, la identidad también, y la persona sigue entrando con su usuario', async () => {
    const id = await crearCuentaVieja()
    expect(await cuentasConCorreo(admin as never)).toContain(id)

    // Una sesión abierta antes del cambio.
    const abierta = clienteSinSesion()
    expect((await abierta.auth.signInWithPassword({ email: CORREO, password: CONTRASENA })).error).toBeNull()

    expect(await pasarADireccionInterna(admin as never, id)).toBe('cambiada')

    const { data } = await admin.auth.admin.getUserById(id)
    const nueva = data.user?.email ?? ''
    expect(esDireccionInterna(nueva)).toBe(true)
    // Ni la cuenta ni su identidad de correo conservan el correo real.
    expect(JSON.stringify(data.user)).not.toContain(CORREO)
    expect(await cuentasConCorreo(admin as never)).not.toContain(id)

    // Con el correo ya no se entra; con la dirección que el login busca por usuario, sí.
    const conCorreo = await clienteSinSesion().auth.signInWithPassword({ email: CORREO, password: CONTRASENA })
    expect(conCorreo.error?.code).toBe('invalid_credentials')
    expect(await direccionDeAcceso(admin as never, USUARIO)).toEqual({ ok: true, correo: nueva })
    const conUsuario = await clienteSinSesion().auth.signInWithPassword({ email: nueva, password: CONTRASENA })
    expect(conUsuario.error).toBeNull()
    expect(conUsuario.data.user?.id).toBe(id)

    // La sesión que estaba abierta sigue valiendo: nadie queda afuera.
    const renovada = await abierta.auth.refreshSession()
    expect(renovada.error).toBeNull()
    expect(renovada.data.user?.id).toBe(id)
  })

  it('es idempotente', async () => {
    const id = await crearCuentaVieja()
    expect(await pasarADireccionInterna(admin as never, id)).toBe('cambiada')
    const { data: antes } = await admin.auth.admin.getUserById(id)
    expect(await pasarADireccionInterna(admin as never, id)).toBe('ya-interna')
    const { data: despues } = await admin.auth.admin.getUserById(id)
    expect(despues.user?.email).toBe(antes.user?.email)
  })
})
