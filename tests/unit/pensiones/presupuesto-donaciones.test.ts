import { describe, expect, it } from 'vitest'
import { resumenAnual, resumenPresupuesto, saldoMes } from '@/lib/pensiones/calculos'
import { ETIQUETA_DONACIONES } from '@/lib/pensiones/etiquetas'
import type { FilaPresupuesto } from '@/lib/pensiones/tipos'

const periodo = '2027-01-01'
const pension: FilaPresupuesto = {
  concepto: 'pension', usuario_id: 'persona', etiqueta: 'AB', periodo,
  categoria: 'profesional', monto_centavos: 100000, pagado_centavos: 60000,
  registrado_en: '2027-02-02T12:00:00Z', exento: false,
}
const donacion: FilaPresupuesto = {
  concepto: 'donacion', usuario_id: null, etiqueta: ETIQUETA_DONACIONES, periodo,
  categoria: null, monto_centavos: 20000, pagado_centavos: 0,
  registrado_en: null, exento: false,
}

describe('presupuesto compartido de pensiones e ingresos por donaciones', () => {
  it('incluye el esperado antes de recibir, y al recibir sólo aumenta el ejecutado', () => {
    const antes = resumenPresupuesto([pension, donacion])
    expect(antes).toEqual({ meta: 120000, pagado: 60000, falta: 60000, porcentaje: 50 })
    expect(saldoMes(donacion)).toBe(20000)
    const recibida = { ...donacion, pagado_centavos: 20000, registrado_en: '2027-03-04T12:00:00Z' }
    expect(resumenPresupuesto([pension, recibida])).toEqual({ meta: 120000, pagado: 80000, falta: 40000, porcentaje: 80000 / 120000 * 100 })
    expect(saldoMes(recibida)).toBe(0)
  })

  it('suma cada período una sola vez en el año y separa el concepto de las personas', () => {
    const meses = Array.from({ length: 12 }, (_, i) => {
      const mes = `2027-${String(i + 1).padStart(2, '0')}-01`
      return [
        { ...pension, periodo: mes, pagado_centavos: i === 0 ? 60000 : 0 },
        { ...donacion, periodo: mes, monto_centavos: i < 6 ? 20000 : 30000, pagado_centavos: i === 0 ? 20000 : 0 },
      ]
    })
    const resumen = resumenAnual(meses)
    expect(resumen.total).toMatchObject({ meta: 1500000, pagado: 80000, falta: 1420000 })
    expect(resumen.meses[0]).toMatchObject({ periodo, meta: 120000, pagado: 80000, falta: 40000 })
    expect(resumen.meses[6]).toMatchObject({ meta: 130000, pagado: 0 })
    expect(resumen.personas).toHaveLength(1)
    expect(resumen.personas[0]).toMatchObject({ usuario_id: 'persona', meta: 1200000, pagado: 60000 })
    expect(resumen.donaciones).toMatchObject({ meta: 300000, pagado: 20000, falta: 280000 })
    expect(resumen.sinCuota).toEqual([])
    expect(resumen.sinDonacion).toBe(false)
  })

  it('un concepto sin configuración no se cuenta como persona ni como cuota faltante', () => {
    const resumen = resumenAnual([[{ ...donacion, monto_centavos: null }]])
    expect(resumen.personas).toEqual([])
    expect(resumen.sinCuota).toEqual([])
    expect(resumen.sinDonacion).toBe(true)
    expect(resumen.donaciones).toEqual({ meta: 0, pagado: 0, falta: 0, porcentaje: 0 })
  })

  it('conserva pagos parciales e históricos de una persona exenta junto a la donación', () => {
    const exenta = { ...pension, exento: true, pagado_centavos: 5000 }
    const recibida = { ...donacion, pagado_centavos: 20000 }
    const resumen = resumenAnual([[exenta, recibida]])
    expect(resumen.total).toEqual({ meta: 20000, pagado: 25000, falta: 0, porcentaje: 100 })
    expect(resumen.personas[0]).toMatchObject({ exento: true, meta: 0, pagado: 5000 })
    expect(resumen.donaciones).toMatchObject({ meta: 20000, pagado: 20000, falta: 0 })
  })
})
