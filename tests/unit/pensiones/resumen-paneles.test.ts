import { describe, expect, it } from 'vitest'
import { resumenDonacion, resumenMiPension } from '@/lib/pensiones/resumen-paneles'
import type { MesDonacion } from '@/lib/pensiones/donaciones'
import type { MesPension } from '@/lib/pensiones/tipos'

const periodo = '2026-10-01'
const pension = (cambios: Partial<MesPension> = {}): MesPension => ({
  periodo, categoria: 'profesional', monto_centavos: 30000, pagado_centavos: 0,
  registrado_en: null, exento: false, ...cambios,
})
const donacion = (cambios: Partial<MesDonacion> = {}): MesDonacion => ({
  periodo, monto_centavos: 15000, recibido_en: null, registrado_por: null, ...cambios,
})

describe('resumen de Mi pensión en el panel cerrado', () => {
  it('distingue información no disponible de una cuota sin configurar', () => {
    expect(resumenMiPension(undefined, periodo)).toBe('octubre de 2026 · Sin información disponible')
    expect(resumenMiPension(pension({ monto_centavos: null, categoria: null }), periodo))
      .toBe('octubre de 2026 · Sin cuota configurada')
  })

  it('muestra lo que falta cuando está pendiente o parcialmente pagado', () => {
    expect(resumenMiPension(pension(), periodo)).toBe('octubre de 2026 · Pendiente · Falta $300.00')
    expect(resumenMiPension(pension({ pagado_centavos: 7535 }), periodo))
      .toBe('octubre de 2026 · Pago parcial · Falta $224.65')
  })

  it('reconoce un pago completo sin pedir más dinero', () => {
    expect(resumenMiPension(pension({ pagado_centavos: 30000 }), periodo))
      .toBe('octubre de 2026 · Pagado · $300.00')
  })

  it('prioriza la exención y muestra cero aunque conserve una cuota o pagos anteriores', () => {
    expect(resumenMiPension(pension({ exento: true, pagado_centavos: 5000 }), periodo))
      .toBe('octubre de 2026 · Exento de pensión · $0.00')
    expect(resumenMiPension(pension({ exento: true, monto_centavos: null }), periodo))
      .toBe('octubre de 2026 · Exento de pensión · $0.00')
  })

  it('identifica el período consultado también en otro año', () => {
    expect(resumenMiPension(undefined, '2027-01-01')).toBe('enero de 2027 · Sin información disponible')
    expect(resumenMiPension(pension({ periodo: '2025-12-01' }), '2025-12-01'))
      .toBe('diciembre de 2025 · Pendiente · Falta $300.00')
  })
})

describe('resumen de Ingresos por donaciones en el panel cerrado', () => {
  it('distingue información no disponible de un monto sin configurar', () => {
    expect(resumenDonacion(undefined, periodo)).toBe('octubre de 2026 · Sin información disponible')
    expect(resumenDonacion(donacion({ monto_centavos: null }), periodo))
      .toBe('octubre de 2026 · Sin monto configurado')
  })

  it('muestra el monto pendiente de envío y no confunde cero con null', () => {
    expect(resumenDonacion(donacion(), periodo)).toBe('octubre de 2026 · Pendiente de envío · $150.00')
    expect(resumenDonacion(donacion({ monto_centavos: 0 }), periodo))
      .toBe('octubre de 2026 · Pendiente de envío · $0.00')
  })

  it('muestra Enviado para un envío registrado por cualquier Director', () => {
    expect(resumenDonacion(donacion({ recibido_en: '2026-10-21T12:00:00Z', registrado_por: 'otro-director' }), periodo))
      .toBe('octubre de 2026 · Enviado · $150.00')
  })

  it('conserva Enviado sin inventar un importe cuando no está disponible', () => {
    expect(resumenDonacion(donacion({ monto_centavos: null, recibido_en: '2026-10-21T12:00:00Z' }), periodo))
      .toBe('octubre de 2026 · Enviado')
  })

  it('identifica el período consultado también en otro año', () => {
    expect(resumenDonacion(donacion({ periodo: '2025-12-01' }), '2025-12-01'))
      .toBe('diciembre de 2025 · Pendiente de envío · $150.00')
  })
})
