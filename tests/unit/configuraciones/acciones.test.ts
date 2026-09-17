import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import {
  cambiarEstadoCuenta,
  cambiarMiContrasena,
  cambiarRolCuenta,
  crearNuevaCuenta,
  guardarHorasLimite,
  guardarMiCuenta,
  ponerContrasenaTemporal,
} from '@/app/(app)/configuraciones/acciones'
import { perfilParaAccion, type Perfil } from '@/lib/auth/sesion'
import { MENSAJE_CORREO_REPETIDO } from '@/lib/configuraciones/errores'
import { verificarContrasena } from '@/lib/cuentas/verificar-contrasena'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/servidor'

// Las acciones se prueban sin base: sesión, clientes de Supabase y caché de Next se reemplazan.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))
vi.mock('@/lib/cuentas/verificar-contrasena', () => ({ verificarContrasena: vi.fn() }))

const { revalidatePath } = await import('next/cache')

const ID_DIRECTOR = '0b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
const ID_OTRA = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const CONTRASENA = 'k7hm-pq3x-wn9d'

const DIRECTOR: Perfil = {
  id: ID_DIRECTOR,
  nombre: 'Directora Prueba',
  siglas: 'DP',
  correo: 'director@prueba.test',
  rol: 'director',
  activo: true,
  debe_cambiar_contrasena: false,
  avisar_hora_limite: true,
  avisar_mensajes: true,
  creado_en: '2026-09-17T00:00:00Z',
}

type Respuesta = { data: unknown; error: unknown }

const LECTURA_VACIA: Respuesta = { data: null, error: null }
const ESCRITURA_OK: Respuesta = { data: [{ id: ID_OTRA }], error: null }
const AUTH_OK: Respuesta = { data: { user: { id: ID_OTRA } }, error: null }

/**
 * Cliente de Supabase falso: devuelve en orden las respuestas de lecturas, escrituras y Auth
 * (si se acaban, responde éxito) y registra los valores de cada `update`.
 */
function clienteFalso(respuestas: { lecturas?: Respuesta[]; escrituras?: Respuesta[]; auth?: Respuesta[] } = {}) {
  const lecturas = [...(respuestas.lecturas ?? [])]
  const escrituras = [...(respuestas.escrituras ?? [])]
  const auth = [...(respuestas.auth ?? [])]
  const actualizaciones: Record<string, unknown>[] = []

  function consulta() {
    let escritura: Respuesta | null = null
    const q = {
      select: () => q,
      eq: () => q,
      neq: () => q,
      update: (valores: Record<string, unknown>) => {
        actualizaciones.push(valores)
        escritura = escrituras.shift() ?? ESCRITURA_OK
        return q
      },
      maybeSingle: () => Promise.resolve(lecturas.shift() ?? LECTURA_VACIA),
      then: (resolver: (r: Respuesta) => unknown, rechazar?: (motivo: unknown) => unknown) =>
        Promise.resolve(escritura ?? lecturas.shift() ?? LECTURA_VACIA).then(resolver, rechazar),
    }
    return q
  }

  const respuestaAuth = async () => auth.shift() ?? AUTH_OK
  const cliente = {
    from: vi.fn(consulta),
    auth: {
      admin: { updateUserById: vi.fn(respuestaAuth), createUser: vi.fn(respuestaAuth) },
      getUser: vi.fn(),
      updateUser: vi.fn(async () => ({ data: { user: {} }, error: null })),
    },
  }
  return { cliente, actualizaciones }
}

function usarAdmin(falso: ReturnType<typeof clienteFalso>) {
  vi.mocked(crearClienteAdmin).mockReturnValue(falso.cliente as never)
  return falso
}

function formulario(campos: Record<string, string>) {
  const datos = new FormData()
  for (const [clave, valor] of Object.entries(campos)) datos.set(clave, valor)
  return datos
}

const errorDeRed = () => ({ data: { user: null }, error: new AuthRetryableFetchError('fetch failed', 0) })
const errorDeServidor = () => ({
  data: { user: null },
  error: new AuthApiError('Internal error', 500, 'unexpected_failure'),
})
const rechazoDeAuth = (codigo: string) => ({ data: { user: null }, error: new AuthApiError('Rechazado', 422, codigo) })

let errorConsola: MockInstance<typeof console.error>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: DIRECTOR })
  errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  // Nunca se registran contraseñas.
  expect(JSON.stringify(errorConsola.mock.calls)).not.toContain(CONTRASENA)
  errorConsola.mockRestore()
})

describe('guardas del servidor sobre la propia cuenta', () => {
  it('el Director no puede cambiar su propio rol', async () => {
    expect(await cambiarRolCuenta({ id: ID_DIRECTOR, rol: 'residente' })).toEqual({
      ok: false,
      error: 'No podés cambiar tu propio rol.',
      campos: undefined,
    })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })

  it('el Director no puede desactivar su propia cuenta', async () => {
    const r = await cambiarEstadoCuenta({ id: ID_DIRECTOR, activo: false })
    expect(r).toMatchObject({ ok: false, error: 'No podés desactivar tu propia cuenta.' })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })

  it('el Director no se pone una contraseña temporal a sí mismo', async () => {
    const r = await ponerContrasenaTemporal(null, formulario({ id: ID_DIRECTOR, contrasena: CONTRASENA }))
    expect(r).toMatchObject({ ok: false, error: 'Tu propia contraseña se cambia en "Mi cuenta".' })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })

  it('sin rol de Director no llega a la base', async () => {
    vi.mocked(perfilParaAccion).mockResolvedValue({ ok: false, error: 'No tenés permiso para hacer esto.' })
    expect(await cambiarRolCuenta({ id: ID_OTRA, rol: 'director' })).toMatchObject({ ok: false })
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })
})

describe('cambiarRolCuenta', () => {
  it('distingue un error de la base de una cuenta inexistente', async () => {
    usarAdmin(clienteFalso({ escrituras: [{ data: null, error: { code: '08006', message: 'conexión' } }] }))
    expect(await cambiarRolCuenta({ id: ID_OTRA, rol: 'director' })).toMatchObject({
      error: 'No se pudo cambiar el rol. Intentá de nuevo.',
    })
    expect(errorConsola).toHaveBeenCalledWith(expect.stringContaining(ID_OTRA), expect.anything())

    usarAdmin(clienteFalso({ escrituras: [{ data: [], error: null }] }))
    expect(await cambiarRolCuenta({ id: ID_OTRA, rol: 'director' })).toMatchObject({ error: 'La cuenta no existe.' })
  })
})

describe('ponerContrasenaTemporal', () => {
  const enviar = () => ponerContrasenaTemporal(null, formulario({ id: ID_OTRA, contrasena: CONTRASENA }))
  const sinMarca = { data: { debe_cambiar_contrasena: false }, error: null }

  it('marca el cambio obligatorio antes de cambiar la contraseña', async () => {
    const falso = usarAdmin(clienteFalso({ lecturas: [sinMarca] }))
    expect(await enviar()).toEqual({ ok: true, data: null })
    expect(falso.actualizaciones).toEqual([{ debe_cambiar_contrasena: true }])
  })

  it('un error de la base al leer la cuenta no se informa como cuenta inexistente', async () => {
    usarAdmin(clienteFalso({ lecturas: [{ data: null, error: { code: '08006', message: 'conexión' } }] }))
    expect(await enviar()).toMatchObject({ error: 'No se pudo poner la contraseña temporal. Intentá de nuevo.' })

    usarAdmin(clienteFalso({ lecturas: [LECTURA_VACIA] }))
    expect(await enviar()).toMatchObject({ error: 'La cuenta no existe.' })
  })

  it('si Auth rechaza la contraseña, quita la marca y lo muestra en el campo', async () => {
    const falso = usarAdmin(clienteFalso({ lecturas: [sinMarca], auth: [rechazoDeAuth('weak_password')] }))
    expect(await enviar()).toMatchObject({ campos: { contrasena: expect.stringContaining('débil') } })
    expect(falso.actualizaciones).toEqual([{ debe_cambiar_contrasena: true }, { debe_cambiar_contrasena: false }])
    expect(errorConsola).toHaveBeenCalledWith(expect.stringContaining(ID_OTRA), expect.any(AuthApiError))
  })

  it.each([
    ['sin respuesta de Auth', errorDeRed],
    ['con un 5xx de Auth', errorDeServidor],
  ])('%s la marca queda en true y pide volver a intentarlo', async (_caso, error) => {
    const falso = usarAdmin(clienteFalso({ lecturas: [sinMarca], auth: [error()] }))
    const r = await enviar()
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('Volvé a ponerla') })
    expect(falso.actualizaciones).toEqual([{ debe_cambiar_contrasena: true }])
    expect(revalidatePath).toHaveBeenCalledWith('/configuraciones')
  })
})

describe('cambiarEstadoCuenta', () => {
  it('desactivar: si Auth rechaza el bloqueo, la cuenta vuelve a activa', async () => {
    const falso = usarAdmin(clienteFalso({ auth: [rechazoDeAuth('validation_failed')] }))
    expect(await cambiarEstadoCuenta({ id: ID_OTRA, activo: false })).toMatchObject({
      error: 'No se pudo desactivar la cuenta. Intentá de nuevo.',
    })
    expect(falso.actualizaciones).toEqual([{ activo: false }, { activo: true }])
  })

  it('desactivar: si no se sabe si Auth bloqueó, la cuenta queda desactivada', async () => {
    const falso = usarAdmin(clienteFalso({ auth: [errorDeRed()] }))
    expect(await cambiarEstadoCuenta({ id: ID_OTRA, activo: false })).toMatchObject({
      error: expect.stringContaining('quedó desactivada'),
    })
    expect(falso.actualizaciones).toEqual([{ activo: false }])
    expect(revalidatePath).toHaveBeenCalledWith('/configuraciones')
  })

  it('desactivar: si falla la reversión, avisa que quedó desactivada', async () => {
    const falso = usarAdmin(
      clienteFalso({
        escrituras: [ESCRITURA_OK, { data: null, error: { code: '08006', message: 'conexión' } }],
        auth: [rechazoDeAuth('validation_failed')],
      }),
    )
    expect(await cambiarEstadoCuenta({ id: ID_OTRA, activo: false })).toMatchObject({
      error: expect.stringContaining('quedó desactivada'),
    })
    expect(falso.actualizaciones).toEqual([{ activo: false }, { activo: true }])
    expect(errorConsola).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['rechazo', () => rechazoDeAuth('validation_failed')],
    ['error ambiguo', errorDeRed],
  ])('reactivar: ante un %s de Auth la cuenta vuelve a desactivada', async (_caso, error) => {
    const falso = usarAdmin(clienteFalso({ auth: [error()] }))
    expect(await cambiarEstadoCuenta({ id: ID_OTRA, activo: true })).toMatchObject({
      error: 'No se pudo reactivar la cuenta. Intentá de nuevo.',
    })
    expect(falso.actualizaciones).toEqual([{ activo: true }, { activo: false }])
  })
})

describe('crearNuevaCuenta', () => {
  it('un correo que Auth ya tiene se muestra en el campo correo', async () => {
    usarAdmin(clienteFalso({ auth: [rechazoDeAuth('email_exists')] }))
    const r = await crearNuevaCuenta(
      null,
      formulario({ nombre: 'Ana', siglas: 'AT', correo: 'ana@centro.org', rol: 'residente', contrasena: CONTRASENA }),
    )
    expect(r).toEqual({ ok: false, error: 'Revisá los datos.', campos: { correo: MENSAJE_CORREO_REPETIDO } })
  })
})

describe('Mi cuenta', () => {
  it('devuelve los datos normalizados que quedaron guardados', async () => {
    usarAdmin(clienteFalso())
    const r = await guardarMiCuenta(
      null,
      formulario({ nombre: '  Directora Renombrada ', siglas: ' dr ', correo: ' Nuevo@Prueba.TEST ' }),
    )
    expect(r).toEqual({
      ok: true,
      data: { nombre: 'Directora Renombrada', siglas: 'DR', correo: 'nuevo@prueba.test' },
    })
  })

  it('verifica la contraseña actual con el correo de la sesión de Auth, no el del perfil', async () => {
    const falso = clienteFalso()
    falso.cliente.auth.getUser.mockResolvedValue({
      data: { user: { id: ID_DIRECTOR, email: 'correo-de-auth@prueba.test' } },
      error: null,
    })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    vi.mocked(verificarContrasena).mockResolvedValue(true)

    const r = await cambiarMiContrasena(
      null,
      formulario({ actual: 'clave-actual-1', nueva: 'clave-nueva-2', confirmacion: 'clave-nueva-2' }),
    )
    expect(r).toEqual({ ok: true, data: null })
    expect(verificarContrasena).toHaveBeenCalledWith('correo-de-auth@prueba.test', 'clave-actual-1')
  })
})

describe('guardarHorasLimite', () => {
  it('ante un guardado parcial revalida la página y devuelve el fallo', async () => {
    const falso = clienteFalso({
      escrituras: [ESCRITURA_OK, { data: [], error: null }, ESCRITURA_OK],
    })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)

    const r = await guardarHorasLimite(
      null,
      formulario({
        desayuno_dia: '-1',
        desayuno_hora: '21:00',
        almuerzo_dia: '0',
        almuerzo_hora: '10:00',
        cena_dia: '0',
        cena_hora: '16:00',
      }),
    )
    expect(r).toMatchObject({ ok: false, error: 'No se pudieron guardar las horas límite. Intentá de nuevo.' })
    expect(revalidatePath).toHaveBeenCalledWith('/configuraciones')
    expect(errorConsola).toHaveBeenCalledTimes(1)
  })
})
