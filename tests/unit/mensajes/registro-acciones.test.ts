import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cargarRegistroModeracion } from '@/app/(app)/mensajes/acciones'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { listarRegistroModeracion } from '@/lib/mensajes/consultas'
import { perfilDePrueba } from '@/tests/soporte/supabase-falso'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))
vi.mock('@/lib/mensajes/consultas', () => ({
  listarPublicaciones: vi.fn(),
  obtenerPublicacion: vi.fn(),
  listarRegistroModeracion: vi.fn(),
}))
vi.mock('@/lib/perfiles/consultas', () => ({ listarPerfiles: vi.fn() }))
vi.mock('@/lib/push/avisos', () => ({
  avisarNuevaPublicacion: vi.fn(),
  avisarNuevaRespuesta: vi.fn(),
  avisarMensajePendiente: vi.fn(),
  avisarModeracion: vi.fn(),
}))

const cursor = { eliminadoEn: '2026-10-13T16:05:00.123456+00:00', id: '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: perfilDePrueba(cursor.id, 'director') })
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe('cargarRegistroModeracion', () => {
  it('exige sesión de Director antes de consultar', async () => {
    const denegado = { ok: false as const, error: 'No tenés permiso.' }
    vi.mocked(perfilParaAccion).mockResolvedValue(denegado)
    expect(await cargarRegistroModeracion({ antesDe: cursor })).toEqual(denegado)
    expect(perfilParaAccion).toHaveBeenCalledWith('director')
    expect(listarRegistroModeracion).not.toHaveBeenCalled()
  })

  it('conserva el cursor con microsegundos y devuelve la página', async () => {
    const pagina = { entradas: [], hayMas: false, cursor: null }
    vi.mocked(listarRegistroModeracion).mockResolvedValue(pagina)
    expect(await cargarRegistroModeracion({ antesDe: cursor })).toEqual({ ok: true, data: pagina })
    expect(listarRegistroModeracion).toHaveBeenCalledWith(cursor)
  })

  it('rechaza cursores incompletos o filtros inyectados antes de consultar', async () => {
    for (const antesDe of [
      { eliminadoEn: cursor.eliminadoEn },
      { ...cursor, id: 'id.gt.0)' },
      { ...cursor, eliminadoEn: 'ayer,eliminado_en.gt.2000' },
    ]) {
      expect((await cargarRegistroModeracion({ antesDe })).ok).toBe(false)
    }
    expect(listarRegistroModeracion).not.toHaveBeenCalled()
  })

  it('una falla de la base vuelve como error que permite reintentar', async () => {
    vi.mocked(listarRegistroModeracion).mockRejectedValue(new Error('Sin conexión'))
    expect(await cargarRegistroModeracion({ antesDe: cursor })).toEqual({
      ok: false,
      error: 'No se pudo cargar el registro. Revisá tu conexión e intentá de nuevo.',
    })
  })
})
