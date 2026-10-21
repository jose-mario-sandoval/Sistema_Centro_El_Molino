import { describe, expect, it } from 'vitest'
import { cargaPagoPension } from '@/lib/push/cargas-pensiones'

describe('carga de pagos de pensiones', () => {
  const pago = { pagoId: 'movimiento-1', siglas: 'RP', periodo: '2026-10-01', abonoCentavos: 5029, completado: false }
  it('informa únicamente el nuevo abono parcial y abre el presupuesto del período', () => {
    expect(cargaPagoPension(pago)).toEqual({
      titulo: 'Pago de pensión registrado',
      cuerpo: 'RP: $50.29 para octubre de 2026. Abono parcial.',
      url: '/pensiones/presupuesto?anio=2026&mes=10',
      etiqueta: 'pension-movimiento-1',
    })
  })
  it('el abono que completa la cuota informa ese importe nuevo, sin confundirlo con el acumulado', () => {
    const carga = cargaPagoPension({ ...pago, completado: true, abonoCentavos: 10000 })
    expect(carga.cuerpo).toBe('RP: $100.00 para octubre de 2026. Pensión pagada.')
  })
})
