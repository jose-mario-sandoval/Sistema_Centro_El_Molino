import { beforeEach, describe, expect, it, vi } from 'vitest'
import { avisarPagoPension } from '@/lib/push/avisos-pensiones'
import { enviarAUsuarios } from '@/lib/push/enviar'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { clienteSupabaseFalso } from '@/tests/soporte/supabase-falso'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
vi.mock('@/lib/push/enviar', () => ({ enviarAUsuarios: vi.fn() }))

const pago = { siglas: 'RP', periodo: '2026-10-01', abono_centavos: 5000, completado: false }
function usar(pagos: unknown[] = [pago], error: unknown = null) {
  const falso = clienteSupabaseFalso({ rpc: [{ data: pagos, error }], consultas: [{ data: [{ id: 'administradora' }], error: null }] })
  vi.mocked(crearClienteAdmin).mockReturnValue(falso.cliente as never)
  return falso
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
describe('avisarPagoPension', () => {
  it('consulta solo siglas y destinatarias activas de rol exacto, con preferencia propia', async () => {
    const falso = usar()
    await avisarPagoPension('abono-1')
    expect(falso.rpcs).toEqual([{ nombre: 'aviso_pago_pension', args: { p_pago_id: 'abono-1' } }])
    expect(falso.operaciones).toEqual([{
      tabla: 'perfiles', operacion: 'select', columnas: 'id',
      filtros: [['rol', 'administradora'], ['activo', true], ['avisar_pensiones', true]],
    }])
    expect(enviarAUsuarios).toHaveBeenCalledWith(['administradora'], expect.objectContaining({
      cuerpo: 'RP: $50.00 para octubre de 2026. Abono parcial.',
    }), { avisoPagoPension: { pagoId: 'abono-1' } })
    const enviado = JSON.stringify(vi.mocked(enviarAUsuarios).mock.calls)
    expect(enviado).not.toMatch(/nombre|usuario_id|Residente Prueba|avisar_mensajes|avisar_cocina/)
  })
  it('un id sin evento o un importe de cero nunca envía', async () => {
    usar([])
    await avisarPagoPension('histórico')
    usar([{ ...pago, abono_centavos: 0 }])
    await avisarPagoPension('cero')
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })
  it('un fallo del servicio push se contiene después del pago; no intenta revertirlo', async () => {
    const falso = usar()
    vi.mocked(enviarAUsuarios).mockRejectedValueOnce(new Error('servicio caído'))
    await expect(avisarPagoPension('abono-1')).resolves.toBeUndefined()
    expect(falso.operaciones.every((op) => op.operacion === 'select')).toBe(true)
    expect(console.error).toHaveBeenCalled()
  })
  it('un fallo al leer no envía un contenido alternativo sin protección', async () => {
    usar([], { code: '08006' })
    await expect(avisarPagoPension('abono-1')).resolves.toBeUndefined()
    expect(enviarAUsuarios).not.toHaveBeenCalled()
  })
})
