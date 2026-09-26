import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cargarPublicacion,
  desfijarPublicacion,
  fijarPublicacion,
  moderarMensaje,
  publicarMensaje,
  responderMensaje,
} from '@/app/(app)/mensajes/acciones'
import { perfilParaAccion, type Perfil } from '@/lib/auth/sesion'
import { obtenerPublicacion } from '@/lib/mensajes/consultas'
import type { Rol } from '@/lib/perfiles/roles'
import { avisarNuevaPublicacion, avisarNuevaRespuesta } from '@/lib/push/avisos'
import { crearClienteServidor } from '@/lib/supabase/servidor'

// Las acciones se prueban sin base: sesión, cliente de Supabase, avisos y caché de Next se reemplazan.
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))
vi.mock('@/lib/push/avisos', () => ({ avisarNuevaPublicacion: vi.fn(), avisarNuevaRespuesta: vi.fn() }))
vi.mock('@/lib/mensajes/consultas', () => ({ listarPublicaciones: vi.fn(), obtenerPublicacion: vi.fn() }))
vi.mock('@/lib/perfiles/consultas', () => ({ listarPerfiles: vi.fn() }))

const { revalidatePath } = await import('next/cache')
const { after } = await import('next/server')

const ID = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'
const PADRE = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

function perfil(rol: Rol): Perfil {
  return {
    id: `id-${rol}`,
    nombre: `Nombre ${rol}`,
    siglas: 'XX',
    correo: `${rol}@prueba.test`,
    rol,
    activo: true,
    debe_cambiar_contrasena: false,
    avisar_hora_limite: true,
    avisar_mensajes: true,
    apariencia_tema: null,
    apariencia_contraste: null,
    apariencia_texto: null,
    creado_en: '2026-09-17T00:00:00Z',
  }
}

type Respuesta = { data?: unknown; error: unknown }

/** Cliente falso: registra inserciones, actualizaciones (con sus filtros) y llamadas a RPC. */
function clienteFalso({
  insercion = { error: null },
  actualizacion = { data: [], error: null },
  rpc = { data: null, error: null },
}: { insercion?: Respuesta; actualizacion?: Respuesta; rpc?: Respuesta } = {}) {
  const registro = {
    inserciones: [] as unknown[],
    actualizaciones: [] as unknown[],
    filtros: [] as [string, unknown][],
    rpcs: [] as [string, unknown][],
  }
  const cliente = {
    from: () => ({
      insert: (fila: unknown) => {
        registro.inserciones.push(fila)
        return Promise.resolve(insercion)
      },
      update: (valores: unknown) => {
        registro.actualizaciones.push(valores)
        const q = {
          eq: (columna: string, valor: unknown) => {
            registro.filtros.push([columna, valor])
            return q
          },
          select: () => Promise.resolve(actualizacion),
        }
        return q
      },
    }),
    rpc: (nombre: string, args: unknown) => {
      registro.rpcs.push([nombre, args])
      return Promise.resolve(rpc)
    },
  }
  vi.mocked(crearClienteServidor).mockResolvedValue(cliente as unknown as Awaited<ReturnType<typeof crearClienteServidor>>)
  return registro
}

function como(rol: Rol) {
  vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: perfil(rol) })
}

/** Corre lo que la acción dejó programado con after() (el aviso push). */
async function correrAfter() {
  for (const [tarea] of vi.mocked(after).mock.calls) await (tarea as () => Promise<void>)()
}

function formulario(campos: Record<string, string>): FormData {
  const datos = new FormData()
  for (const [clave, valor] of Object.entries(campos)) datos.set(clave, valor)
  return datos
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
})

describe('publicar y responder: el aviso push solo si se publica directo', () => {
  it('un Residente publica y no se avisa (queda pendiente)', async () => {
    como('residente')
    clienteFalso()
    expect(await publicarMensaje(null, formulario({ id: ID, texto: 'Hola' }))).toEqual({ ok: true, data: { id: ID } })
    expect(after).not.toHaveBeenCalled()
  })

  it('Director y Administración publican y se avisa', async () => {
    for (const rol of ['director', 'administracion'] as const) {
      vi.clearAllMocks()
      como(rol)
      clienteFalso()
      await publicarMensaje(null, formulario({ id: ID, texto: 'Hola' }))
      await correrAfter()
      expect(avisarNuevaPublicacion).toHaveBeenCalledWith(ID)
    }
  })

  it('una respuesta de Residente no se avisa; la de Administración sí', async () => {
    como('residente')
    clienteFalso()
    await responderMensaje(null, formulario({ id: ID, padreId: PADRE, texto: 'Sí' }))
    expect(after).not.toHaveBeenCalled()

    como('administracion')
    clienteFalso()
    await responderMensaje(null, formulario({ id: ID, padreId: PADRE, texto: 'Sí' }))
    await correrAfter()
    expect(avisarNuevaRespuesta).toHaveBeenCalledWith(ID)
  })
})

describe('moderarMensaje', () => {
  it('aprueba solo lo que sigue pendiente y recién ahí avisa la publicación', async () => {
    como('director')
    const registro = clienteFalso({ actualizacion: { data: [{ id: ID, padre_id: null }], error: null } })
    expect(await moderarMensaje({ id: ID, estado: 'aprobado' })).toEqual({ ok: true, data: null })
    expect(registro.actualizaciones).toEqual([{ estado: 'aprobado', motivo_rechazo: null }])
    expect(registro.filtros).toEqual([
      ['id', ID],
      ['estado', 'pendiente'],
    ])
    await correrAfter()
    expect(avisarNuevaPublicacion).toHaveBeenCalledWith(ID)
    expect(avisarNuevaRespuesta).not.toHaveBeenCalled()
  })

  it('al aprobar una respuesta avisa la respuesta', async () => {
    como('director')
    clienteFalso({ actualizacion: { data: [{ id: ID, padre_id: PADRE }], error: null } })
    await moderarMensaje({ id: ID, estado: 'aprobado' })
    await correrAfter()
    expect(avisarNuevaRespuesta).toHaveBeenCalledWith(ID)
    expect(avisarNuevaPublicacion).not.toHaveBeenCalled()
  })

  it('rechazar no avisa a nadie', async () => {
    como('director')
    clienteFalso({ actualizacion: { data: [{ id: ID, padre_id: null }], error: null } })
    await moderarMensaje({ id: ID, estado: 'rechazado', motivoRechazo: 'No' })
    expect(after).not.toHaveBeenCalled()
  })

  it('si ya no está pendiente (otro Director lo moderó), no hace nada ni avisa de nuevo', async () => {
    como('director')
    clienteFalso({ actualizacion: { data: [], error: null } })
    expect(await moderarMensaje({ id: ID, estado: 'aprobado' })).toMatchObject({
      ok: false,
      error: 'El mensaje ya no existe o ya fue moderado.',
    })
    expect(after).not.toHaveBeenCalled()
  })
})

describe('fijarPublicacion', () => {
  const AHORA = new Date('2026-09-26T20:00:00.000Z') // sábado 14:00 en la casa

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(AHORA)
  })

  it('solo Director y Administración', async () => {
    vi.mocked(perfilParaAccion).mockResolvedValue({ ok: false, error: 'No tenés permiso para hacer esto.' })
    expect(await fijarPublicacion({ id: ID, duracion: 'siempre' })).toMatchObject({ ok: false })
    expect(perfilParaAccion).toHaveBeenCalledWith('director', 'administracion')
  })

  it('"hasta que lo quite": sin fin', async () => {
    como('administracion')
    const registro = clienteFalso({ rpc: { data: '2026-09-26T20:00:00.123456+00:00', error: null } })
    expect(await fijarPublicacion({ id: ID, duracion: 'siempre' })).toEqual({
      ok: true,
      data: { fijadoEn: '2026-09-26T20:00:00.123456+00:00', fijadoHasta: null, fijadoPor: 'id-administracion' },
    })
    expect(registro.rpcs).toEqual([['fijar_mensaje', { p_id: ID, p_hasta: null }]])
    expect(revalidatePath).toHaveBeenCalledWith('/mensajes')
  })

  it('el fin lo calcula el reloj del servidor', async () => {
    como('director')
    const registro = clienteFalso({ rpc: { data: AHORA.toISOString(), error: null } })
    await fijarPublicacion({ id: ID, duracion: '1d' })
    await fijarPublicacion({ id: ID, duracion: 'fecha', fecha: '2026-10-01' })
    expect(registro.rpcs).toEqual([
      ['fijar_mensaje', { p_id: ID, p_hasta: '2026-09-27T20:00:00.000Z' }],
      ['fijar_mensaje', { p_id: ID, p_hasta: '2026-10-02T06:00:00.000Z' }],
    ])
  })

  it('un día que ya pasó se rechaza sin llamar a la base', async () => {
    como('director')
    const registro = clienteFalso()
    expect(await fijarPublicacion({ id: ID, duracion: 'fecha', fecha: '2026-09-25' })).toMatchObject({
      ok: false,
      campos: { fecha: 'Elegí un día de hoy en adelante.' },
    })
    expect(registro.rpcs).toEqual([])
  })

  it('traduce los errores de fijar_mensaje', async () => {
    como('director')
    const casos: [string, string][] = [
      ['42501', 'No tenés permiso para fijar publicaciones.'],
      ['P0002', 'Solo se pueden fijar publicaciones aprobadas que todavía existen.'],
      ['22023', 'Elegí un día de hoy en adelante.'],
      ['XX000', 'No se pudo fijar la publicación. Intentá de nuevo.'],
    ]
    for (const [code, mensaje] of casos) {
      clienteFalso({ rpc: { data: null, error: { code } } })
      expect(await fijarPublicacion({ id: ID, duracion: 'siempre' })).toMatchObject({ ok: false, error: mensaje })
    }
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('desfijarPublicacion', () => {
  it('quita de fijados', async () => {
    como('administracion')
    const registro = clienteFalso()
    expect(await desfijarPublicacion({ id: ID })).toEqual({ ok: true, data: null })
    expect(perfilParaAccion).toHaveBeenCalledWith('director', 'administracion')
    expect(registro.rpcs).toEqual([['desfijar_mensaje', { p_id: ID }]])
    expect(revalidatePath).toHaveBeenCalledWith('/mensajes')
  })

  it('traduce los errores de desfijar_mensaje', async () => {
    como('director')
    clienteFalso({ rpc: { data: null, error: { code: 'P0002' } } })
    expect(await desfijarPublicacion({ id: ID })).toMatchObject({ ok: false, error: 'La publicación ya no existe.' })
    clienteFalso({ rpc: { data: null, error: { code: '42501' } } })
    expect(await desfijarPublicacion({ id: ID })).toMatchObject({
      ok: false,
      error: 'No tenés permiso para quitar publicaciones fijadas.',
    })
  })
})

describe('cargarPublicacion', () => {
  it('trae una publicación con la sesión de quien pregunta (o null si no la puede ver)', async () => {
    como('residente')
    const publicacion = { id: ID, autorId: 'x', texto: 'Hola', creadoEn: '2026-09-26T00:00:00Z', estado: 'aprobado' as const, motivoRechazo: null, reacciones: [], respuestas: [], fijadoEn: null, fijadoHasta: null, fijadoPor: null }
    vi.mocked(obtenerPublicacion).mockResolvedValueOnce(publicacion).mockResolvedValueOnce(null)
    expect(await cargarPublicacion({ id: ID })).toEqual({ ok: true, data: publicacion })
    expect(await cargarPublicacion({ id: ID })).toEqual({ ok: true, data: null })
    expect(obtenerPublicacion).toHaveBeenCalledWith(ID)
  })

  it('id inválido o error de la base: fallo', async () => {
    como('residente')
    expect(await cargarPublicacion({ id: 'x' })).toMatchObject({ ok: false })
    vi.mocked(obtenerPublicacion).mockRejectedValueOnce(new Error('caída'))
    expect(await cargarPublicacion({ id: ID })).toMatchObject({ ok: false, error: 'No se pudo cargar la publicación.' })
  })
})
