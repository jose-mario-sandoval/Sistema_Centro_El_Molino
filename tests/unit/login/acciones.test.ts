import { beforeEach, describe, expect, it, vi } from 'vitest'
import { iniciarSesion } from '@/app/login/acciones'
import { DIRECCION_INEXISTENTE } from '@/lib/cuentas/usuario'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/servidor'

vi.mock('next/navigation', () => ({
  redirect: vi.fn((ruta: string) => {
    throw new Error(`REDIRECT ${ruta}`)
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

type Respuesta = { data: unknown; error: unknown }

/** El cliente con la llave secreta: busca el perfil por usuario y pide la cuenta a Auth. */
function admin(perfil: Respuesta, cuenta: Respuesta = { data: { user: { id: ID, email: 'guardada@en-auth.test' } }, error: null }) {
  const eq = vi.fn(() => ({ maybeSingle: async () => perfil }))
  const cliente = {
    from: vi.fn(() => ({ select: () => ({ eq }) })),
    auth: { admin: { getUserById: vi.fn(async () => cuenta) } },
  }
  vi.mocked(crearClienteAdmin).mockReturnValue(cliente as never)
  return { cliente, eq }
}

/** El cliente de la sesión: entra con la dirección y lee el perfil. */
function servidor(entrada: Respuesta, perfil: Respuesta = { data: { activo: true, debe_cambiar_contrasena: false }, error: null }) {
  const cliente = {
    auth: { signInWithPassword: vi.fn(async () => entrada), signOut: vi.fn(async () => ({ error: null })) },
    from: vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => perfil }) }) })),
  }
  vi.mocked(crearClienteServidor).mockResolvedValue(cliente as never)
  return cliente
}

function formulario(usuario: string, contrasena = 'clave-de-prueba') {
  const datos = new FormData()
  datos.set('usuario', usuario)
  datos.set('contrasena', contrasena)
  return datos
}

const ENTRO: Respuesta = { data: { user: { id: ID } }, error: null }
const RECHAZO: Respuesta = { data: { user: null }, error: { code: 'invalid_credentials' } }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('iniciarSesion: se entra con el usuario', () => {
  it('busca el usuario normalizado y entra con la dirección que guarda Auth', async () => {
    const { eq } = admin({ data: { id: ID }, error: null })
    const sesion = servidor(ENTRO)
    await expect(iniciarSesion(null, formulario('  R.Flores '))).rejects.toThrow('REDIRECT /comidas/semana')
    expect(eq).toHaveBeenCalledWith('usuario', 'r.flores')
    expect(sesion.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'guardada@en-auth.test', password: 'clave-de-prueba' })
  })

  it('quien escribe su correo de siempre llega al usuario que le tocó', async () => {
    const { eq } = admin({ data: { id: ID }, error: null })
    servidor(ENTRO)
    await expect(iniciarSesion(null, formulario('RFlores@Gmail.com'))).rejects.toThrow('REDIRECT')
    expect(eq).toHaveBeenCalledWith('usuario', 'rflores')
  })

  it('un usuario que no existe sigue el mismo camino y da el mismo mensaje que una contraseña mala', async () => {
    const { cliente } = admin({ data: null, error: null })
    const sesion = servidor(RECHAZO)
    expect(await iniciarSesion(null, formulario('nadie'))).toEqual({ ok: false, error: 'Usuario o contraseña incorrectos.' })
    expect(cliente.auth.admin.getUserById).not.toHaveBeenCalled()
    expect(sesion.auth.signInWithPassword).toHaveBeenCalledWith({ email: DIRECCION_INEXISTENTE, password: 'clave-de-prueba' })

    admin({ data: { id: ID }, error: null })
    servidor(RECHAZO)
    expect(await iniciarSesion(null, formulario('r.flores'))).toEqual({ ok: false, error: 'Usuario o contraseña incorrectos.' })
  })

  it('si no se pudo consultar, no dice que el usuario o la contraseña están mal', async () => {
    admin({ data: null, error: { code: '08006' } })
    const sesion = servidor(ENTRO)
    expect(await iniciarSesion(null, formulario('r.flores'))).toEqual({
      ok: false,
      error: 'No se pudo iniciar sesión. Intentá de nuevo.',
    })
    expect(sesion.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('una cuenta desactivada lo dice', async () => {
    admin({ data: { id: ID }, error: null })
    servidor({ data: { user: null }, error: { code: 'user_banned' } })
    expect(await iniciarSesion(null, formulario('r.flores'))).toEqual({
      ok: false,
      error: 'Tu cuenta está desactivada. Hablá con el Director.',
    })
  })

  it('con contraseña temporal va a cambiarla', async () => {
    admin({ data: { id: ID }, error: null })
    servidor(ENTRO, { data: { activo: true, debe_cambiar_contrasena: true }, error: null })
    await expect(iniciarSesion(null, formulario('r.flores'))).rejects.toThrow('REDIRECT /cambiar-contrasena')
  })

  it('sin usuario no llega a la base', async () => {
    expect(await iniciarSesion(null, formulario('   '))).toMatchObject({ ok: false, campos: { usuario: 'Ingresá tu usuario.' } })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })
})
