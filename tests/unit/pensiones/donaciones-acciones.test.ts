import { beforeEach, describe, expect, it, vi } from 'vitest'
import { guardarDonacionPension, recibirDonacionPension } from '@/app/(app)/pensiones/acciones-donacion'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { clienteSupabaseFalso, perfilDePrueba } from '@/tests/soporte/supabase-falso'
import { revalidatePath } from 'next/cache'

vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: perfilDePrueba('0b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', 'director') })
})

describe('acciones de donaciones', () => {
  it.each([guardarDonacionPension, recibirDonacionPension])('exige Director antes de acceder a datos', async (accion) => {
    vi.mocked(perfilParaAccion).mockResolvedValue({ ok: false, error: 'Sin permiso' })
    expect((await accion({})).ok).toBe(false)
    expect(perfilParaAccion).toHaveBeenCalledWith('director')
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })

  it('rechaza vigencias pasadas y montos inválidos antes de consultar SQL', async () => {
    expect((await guardarDonacionPension({ desde: '2000-01-01', monto: '100' })).ok).toBe(false)
    expect((await guardarDonacionPension({ desde: '2099-10-01', monto: '0.001' })).ok).toBe(false)
    expect((await recibirDonacionPension({ periodo: '2099-10-01', monto_esperado: 0 })).ok).toBe(false)
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })

  it('configura un único monto sin persona ni rol enviados por el navegador', async () => {
    const falso = clienteSupabaseFalso({ rpc: [{ data: null, error: null }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect(await guardarDonacionPension({ desde: '2099-10-01', monto: '123.29', usuario_id: 'otro' })).toEqual({ ok: true, data: null })
    expect(falso.rpcs).toEqual([{ nombre: 'guardar_donacion_pension', args: { p_desde: '2099-10-01', p_monto_centavos: 12329 } }])
    expect(revalidatePath).toHaveBeenCalledWith('/pensiones', 'layout')
  })

  it.each([true, false])('la recepción y su reintento anuncian si se creó una fila: %s', async (nueva) => {
    const falso = clienteSupabaseFalso({ rpc: [{ data: [{ periodo: '2099-10-01', nueva }], error: null }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect(await recibirDonacionPension({ periodo: '2099-10-01', monto_esperado: 12329, registrado_por: 'otro', monto_centavos: 999 }))
      .toEqual({ ok: true, data: { nueva } })
    expect(falso.rpcs).toEqual([{ nombre: 'recibir_donacion_pension', args: { p_periodo: '2099-10-01', p_monto_esperado: 12329 } }])
    expect(revalidatePath).toHaveBeenCalledWith('/pensiones', 'layout')
  })

  it('un monto obsoleto no anuncia éxito ni revalida', async () => {
    const falso = clienteSupabaseFalso({ rpc: [{ data: null, error: { code: '40001' } }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect((await recibirDonacionPension({ periodo: '2099-10-01', monto_esperado: 12329 })).ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('una respuesta vacía de recepción no se considera guardada', async () => {
    const falso = clienteSupabaseFalso({ rpc: [{ data: [], error: null }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect((await recibirDonacionPension({ periodo: '2099-10-01', monto_esperado: 12329 })).ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('una configuración rechazada no anuncia éxito ni revalida', async () => {
    const falso = clienteSupabaseFalso({ rpc: [{ data: null, error: { code: '42501' } }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect((await guardarDonacionPension({ desde: '2099-10-01', monto: '123.29' })).ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
