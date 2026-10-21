import { describe, expect, it } from 'vitest'
import { esquemaConfiguracionDonacion, esquemaRecibirDonacion } from '@/lib/pensiones/donaciones'

describe('validación de la donación compartida', () => {
  it('convierte dólares a centavos exactos y descarta identidad del navegador', () => {
    expect(esquemaConfiguracionDonacion.parse({ desde: '2099-10-01', monto: '100.29', usuario_id: 'otra-persona' }))
      .toEqual({ desde: '2099-10-01', monto: 10029 })
    expect(esquemaRecibirDonacion.parse({ periodo: '2099-10-01', monto_esperado: 10029, registrado_por: 'otra-persona' }))
      .toEqual({ periodo: '2099-10-01', monto_esperado: 10029 })
  })

  it.each(['0', '-1', '0.001', '1e3', '1000000.01', '1,000.00', 'NaN'])('rechaza el importe inválido %s', (monto) => {
    expect(esquemaConfiguracionDonacion.safeParse({ desde: '2099-10-01', monto }).success).toBe(false)
  })

  it.each(['2099-10-02', '2099-13-01', '1999-12-01', '2201-01-01'])('rechaza el período inválido %s', (periodo) => {
    expect(esquemaRecibirDonacion.safeParse({ periodo, monto_esperado: 1 }).success).toBe(false)
  })

  it.each([0, -1, 0.5, 100_000_001, null])('exige un monto esperado positivo en centavos: %s', (monto_esperado) => {
    expect(esquemaRecibirDonacion.safeParse({ periodo: '2099-10-01', monto_esperado }).success).toBe(false)
  })
})
