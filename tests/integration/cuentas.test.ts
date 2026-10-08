import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it } from 'vitest'
import { MENSAJE_USUARIO_REPETIDO } from '@/lib/configuraciones/errores'
import { crearCuenta, type DatosCuenta } from '@/lib/cuentas/crear-cuenta'
import { direccionDeAcceso } from '@/lib/cuentas/direccion-de-acceso'
import { DIRECCION_INEXISTENTE, esDireccionInterna } from '@/lib/cuentas/usuario'
import { clienteAdminPrueba, USUARIOS_PRUEBA } from '../soporte/usuarios-prueba'

/*
 * Cuentas con usuario contra el Auth real (spec 2026-10-05 §3): se crean sin correo, con una
 * dirección interna, y se entra con la dirección que el servidor busca por usuario.
 */

const admin = clienteAdminPrueba()
const USUARIO = 'cuenta.integracion'
const CONTRASENA = 'clave-de-integracion-1'

const datos: DatosCuenta = {
  nombre: 'Cuenta de integración',
  siglas: 'CI',
  usuario: USUARIO,
  rol: 'residente',
  contrasena: CONTRASENA,
  debeCambiarContrasena: false,
}

/** Borrar el usuario de Auth borra su perfil (on delete cascade). */
async function borrarCuentasDeEstaPrueba() {
  const { data, error } = await admin.from('perfiles').select('id').like('usuario', 'cuenta.integracion%')
  if (error) throw error
  for (const { id } of data) {
    const { error: errorBorrado } = await admin.auth.admin.deleteUser(id)
    if (errorBorrado) throw errorBorrado
  }
}

function clienteSinSesion() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

afterEach(borrarCuentasDeEstaPrueba)

describe('cuentas con usuario', () => {
  it('se crea sin correo real y se entra con la dirección que el servidor busca por usuario', async () => {
    const resultado = await crearCuenta(admin as never, datos)
    if (!resultado.ok) throw new Error(resultado.error)

    const { data: perfil } = await admin.from('perfiles').select('id, usuario').eq('usuario', USUARIO).single()
    expect(perfil).toEqual({ id: resultado.id, usuario: USUARIO })

    const direccion = await direccionDeAcceso(admin as never, USUARIO)
    if (!direccion.ok) throw new Error('No se pudo buscar la dirección de acceso')
    expect(esDireccionInterna(direccion.correo)).toBe(true)

    const { data, error } = await clienteSinSesion().auth.signInWithPassword({ email: direccion.correo, password: CONTRASENA })
    expect(error).toBeNull()
    expect(data.user?.id).toBe(resultado.id)
  })

  it('una cuenta que ya existía (con su correo en Auth) entra igual por su usuario', async () => {
    const { usuario, correo } = USUARIOS_PRUEBA.residente
    expect(await direccionDeAcceso(admin as never, usuario)).toEqual({ ok: true, correo })
  })

  it('un usuario que no existe da una dirección que no es de nadie, y con ella no se entra', async () => {
    expect(await direccionDeAcceso(admin as never, 'no.existe.nadie')).toEqual({ ok: true, correo: DIRECCION_INEXISTENTE })
    const { data, error } = await clienteSinSesion().auth.signInWithPassword({ email: DIRECCION_INEXISTENTE, password: CONTRASENA })
    expect(data.user).toBeNull()
    // El mismo rechazo que una contraseña equivocada: quien mira desde afuera no distingue los dos casos.
    expect(error?.code).toBe('invalid_credentials')
  })

  it('un usuario repetido se rechaza y no deja una cuenta de Auth suelta', async () => {
    expect((await crearCuenta(admin as never, datos)).ok).toBe(true)
    const antes = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    expect(await crearCuenta(admin as never, datos)).toEqual({ ok: false, error: MENSAJE_USUARIO_REPETIDO })
    const despues = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    expect(despues.data.users.length).toBe(antes.data.users.length)
  })

  it('la base solo acepta usuarios normalizados', async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: 'formato-usuario@prueba.test',
      password: CONTRASENA,
      email_confirm: true,
    })
    if (error) throw error
    const id = data.user.id
    try {
      for (const usuario of ['R.Flores', 'ab', 'r..flores', 'r flores', 'a'.repeat(31)]) {
        const { error: errorPerfil } = await admin.from('perfiles').insert({ id, nombre: 'Formato', siglas: 'FO', usuario, rol: 'residente' })
        expect(errorPerfil?.code, usuario).toBe('23514')
      }
      const { error: sinUsuario } = await admin.from('perfiles').insert({ id, nombre: 'Formato', siglas: 'FO', rol: 'residente' })
      expect(sinUsuario?.code).toBe('23502')
    } finally {
      await admin.auth.admin.deleteUser(id)
    }
  })
})
