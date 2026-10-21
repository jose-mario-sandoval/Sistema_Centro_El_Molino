import { beforeEach, describe, expect, it, vi } from 'vitest'
import { guardarCuotaPension, marcarPensiones } from '@/app/(app)/pensiones/acciones'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { clienteSupabaseFalso, perfilDePrueba } from '@/tests/soporte/supabase-falso'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { avisarPagoPension } from '@/lib/push/avisos-pensiones'

vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/push/avisos-pensiones', () => ({ avisarPagoPension: vi.fn() }))
const ID = '0b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: perfilDePrueba(ID, 'residente') })
})
describe('acciones de pensiones', () => {
  it('guardar cuota exige Director y no escribe ante permiso denegado', async () => {
    vi.mocked(perfilParaAccion).mockResolvedValue({ ok: false, error: 'Sin permiso' })
    expect((await guardarCuotaPension({})).ok).toBe(false)
    expect(perfilParaAccion).toHaveBeenCalledWith('director')
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })
  it('no permite cuotas retroactivas ni importes inválidos', async () => {
    expect((await guardarCuotaPension({ usuario_id: ID, desde: '2000-01-01', categoria: 'profesional', monto: '300' })).ok).toBe(false)
    expect((await guardarCuotaPension({ usuario_id: ID, desde: '2099-01-01', categoria: 'profesional', monto: '0.001' })).ok).toBe(false)
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })
  it('envía monto exacto en centavos y revalida solo después de guardar', async () => {
    const falso = clienteSupabaseFalso({ rpc: [{ data: null, error: null }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect(await guardarCuotaPension({ usuario_id: ID, desde: '2099-01-01', categoria: 'universitario', monto: '300.29' })).toEqual({ ok: true, data: null })
    expect(falso.rpcs[0]).toEqual({ nombre: 'guardar_cuota_pension', args: { p_usuario_id: ID, p_desde: '2099-01-01', p_categoria: 'universitario', p_monto_centavos: 30029 } })
    expect(revalidatePath).toHaveBeenCalledWith('/pensiones', 'layout')
  })
  it('pago exige rol personal y omite toda identidad o categoría enviada por navegador', async () => {
    const falso = clienteSupabaseFalso({ rpc: [{ data: [{ pago_id: 'pago-nuevo' }], error: null }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect(await marcarPensiones({ usuario_id: 'otra-persona', categoria: 'falsa', periodos: ['2099-01-01'], montos: [30000] })).toEqual({ ok: true, data: { cantidad: 1 } })
    expect(perfilParaAccion).toHaveBeenCalledWith('director', 'residente')
    expect(falso.rpcs[0]).toEqual({ nombre: 'marcar_pensiones_con_movimientos', args: { p_periodos: ['2099-01-01'], p_montos_esperados: [30000] } })
    expect(after).toHaveBeenCalledOnce()
    expect(avisarPagoPension).not.toHaveBeenCalled()
    await (vi.mocked(after).mock.calls[0][0] as () => Promise<void>)()
    expect(avisarPagoPension).toHaveBeenCalledWith('pago-nuevo')
  })
  it('rechaza duplicados antes de tocar SQL', async () => {
    expect((await marcarPensiones({ periodos: ['2099-01-01', '2099-01-01'], montos: [30000, 30000] })).ok).toBe(false)
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })
  it('no anuncia éxito ni revalida si la base rechaza un pago', async () => {
    const falso = clienteSupabaseFalso({ rpc: [{ data: null, error: { code: '40001' } }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect((await marcarPensiones({ periodos: ['2099-01-01'], montos: [30000] })).ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
  })
  it('reintento sin inserciones devuelve éxito sin inventar pagos nuevos', async () => {
    const falso = clienteSupabaseFalso({ rpc: [{ data: [], error: null }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect(await marcarPensiones({ periodos: ['2099-01-01'], montos: [30000] })).toEqual({ ok: true, data: { cantidad: 0 } })
    expect(after).not.toHaveBeenCalled()
  })
})

describe('pago parcial', () => {
  it('envía lo ya pagado y el abono para que SQL valide contra lo que falta', async () => {
    const falso = clienteSupabaseFalso({ rpc: [{ data: [{ pago_id: 'abono-nuevo' }], error: null }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect(await marcarPensiones({ periodos: ['2099-01-01'], montos: [30000], pagados: [10000], abonos: [5000] })).toEqual({ ok: true, data: { cantidad: 1 } })
    expect(falso.rpcs[0]).toEqual({ nombre: 'marcar_pensiones_con_movimientos', args: { p_periodos: ['2099-01-01'], p_montos_esperados: [30000], p_pagados_esperados: [10000], p_abonos: [5000] } })
  })

  it('rechaza un abono en cero antes de tocar SQL', async () => {
    expect((await marcarPensiones({ periodos: ['2099-01-01'], montos: [30000], pagados: [0], abonos: [0] })).ok).toBe(false)
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })

  it('si la base rechaza el pago (lo pagado cambió) no revalida ni anuncia éxito', async () => {
    const falso = clienteSupabaseFalso({ rpc: [{ data: null, error: { code: '40001' } }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    const r = await marcarPensiones({ periodos: ['2099-01-01'], montos: [30000], pagados: [0], abonos: [10000] })
    expect(r.ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})
