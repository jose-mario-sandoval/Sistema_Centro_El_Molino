import { describe, expect, it } from 'vitest'
import { centavosDesdeTexto, resumenAnual, resumenPresupuesto, saldoMes, seleccionPagable } from '@/lib/pensiones/calculos'
import { esquemaCuotaPension } from '@/lib/validacion/pensiones'
import type { FilaPresupuesto, MesPension } from '@/lib/pensiones/tipos'

function fila(periodo: string, exento: boolean, monto_centavos: number | null = exento ? 0 : 30000, pagado_centavos = 0): FilaPresupuesto {
  return { concepto: 'pension', usuario_id: 'cuenta-exenta', etiqueta: 'DJ', periodo, exento, categoria: null, monto_centavos, pagado_centavos, registrado_en: null }
}

describe('exención individual de pensión', () => {
  it('no produce saldo ni permite seleccionar pagos incluso ante datos anteriores de una cuota positiva', () => {
    const mes: MesPension = fila('2026-10-01', true, 30000)
    expect(saldoMes(mes)).toBe(0)
    expect(seleccionPagable([mes], [mes.periodo])).toMatchObject({ valido: false, total: 0 })
    expect(seleccionPagable([mes], [mes.periodo], { [mes.periodo]: 1 }).valido).toBe(false)
  })

  it('excluye su cuota de la meta y conserva todos los pagos reales ya registrados', () => {
    const exenta = fila('2026-10-01', true, 30000, 5000)
    const normal = { ...fila('2026-10-01', false), usuario_id: 'otra-cuenta', etiqueta: 'OT' }
    expect(resumenPresupuesto([exenta, normal])).toEqual({ meta: 30000, pagado: 5000, falta: 25000, porcentaje: 5000 / 30000 * 100 })
  })

  it('el año conserva las metas anteriores a la vigencia y excluye los meses exentos', () => {
    const meses = Array.from({ length: 12 }, (_, i) => [fila(`2026-${String(i + 1).padStart(2, '0')}-01`, i >= 9)])
    const resumen = resumenAnual(meses)
    expect(resumen.total.meta).toBe(9 * 30000)
    expect(resumen.meses[8].meta).toBe(30000)
    expect(resumen.meses[9].meta).toBe(0)
    expect(resumen.sinCuota).toEqual([])
    expect(resumen.personas[0]).toMatchObject({ exento: false, exentoDesde: '2026-10-01', meta: 270000 })
  })

  it('un año entero exento muestra estado propio y nunca aparece como persona sin cuota', () => {
    const resumen = resumenAnual(Array.from({ length: 12 }, (_, i) => [fila(`2027-${String(i + 1).padStart(2, '0')}-01`, true)]))
    expect(resumen.total.meta).toBe(0)
    expect(resumen.sinCuota).toEqual([])
    expect(resumen.personas[0]).toMatchObject({ exento: true, falta: 0 })
  })

  it('mantiene la validación positiva habitual para todas las cuotas, sin aceptar $0', () => {
    expect(centavosDesdeTexto('0.00')).toBeNull()
    expect(esquemaCuotaPension.safeParse({ usuario_id: '0b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', desde: '2026-10-01', categoria: 'profesional', monto: '0' }).success).toBe(false)
    expect(seleccionPagable([fila('2026-10-01', false, 30000, 10000)], ['2026-10-01'])).toMatchObject({ valido: true, total: 20000 })
  })
})
