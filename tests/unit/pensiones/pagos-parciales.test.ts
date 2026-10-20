import { describe, expect, it } from 'vitest'
import { saldoMes, seleccionPagable, textoMonto } from '@/lib/pensiones/calculos'
import type { MesPension } from '@/lib/pensiones/tipos'
import { esquemaMarcarPensiones } from '@/lib/validacion/pensiones'

const mes = (periodo: string, monto: number | null, pagado = 0): MesPension => ({ periodo, monto_centavos: monto, pagado_centavos: pagado, categoria: monto === null ? null : 'universitario', registrado_en: null })

describe('pagos parciales', () => {
  it('el saldo es la cuota menos lo pagado, nunca negativo ni de un mes sin cuota', () => {
    expect(saldoMes(mes('2026-10-01', 30000, 10000))).toBe(20000)
    expect(saldoMes(mes('2026-10-01', 30000, 30000))).toBe(0)
    expect(saldoMes(mes('2026-10-01', 30000, 40000))).toBe(0)
    expect(saldoMes(mes('2026-10-01', null))).toBe(0)
  })

  it('escribe un monto en dólares para el campo', () => {
    expect(textoMonto(30000)).toBe('300.00')
    expect(textoMonto(1)).toBe('0.01')
    expect(textoMonto(20050)).toBe('200.50')
  })

  it('un mes con algo pagado todavía se puede elegir: por defecto paga lo que falta', () => {
    const meses = [mes('2026-10-01', 30000, 10000), mes('2026-11-01', 40000)]
    expect(seleccionPagable(meses, ['2026-10-01'])).toMatchObject({ valido: true, abonos: [20000], total: 20000 })
    expect(seleccionPagable(meses, ['2026-10-01', '2026-11-01'])).toMatchObject({ valido: true, abonos: [20000, 40000], total: 60000 })
  })

  it('acepta un pago parcial de 1 centavo hasta lo que falta, y nada fuera de ese rango', () => {
    const meses = [mes('2026-10-01', 30000, 10000)]
    expect(seleccionPagable(meses, ['2026-10-01'], { '2026-10-01': 1 })).toMatchObject({ valido: true, total: 1 })
    expect(seleccionPagable(meses, ['2026-10-01'], { '2026-10-01': 20000 })).toMatchObject({ valido: true, total: 20000 })
    expect(seleccionPagable(meses, ['2026-10-01'], { '2026-10-01': 20001 }).valido).toBe(false)
    expect(seleccionPagable(meses, ['2026-10-01'], { '2026-10-01': 0 }).valido).toBe(false)
  })

  it('un mes pagado del todo no se puede elegir', () => {
    expect(seleccionPagable([mes('2026-10-01', 30000, 30000)], ['2026-10-01']).valido).toBe(false)
  })
})

describe('validación del pago parcial', () => {
  const base = { periodos: ['2099-01-01'], montos: [30000] }

  it('sigue aceptando el pago completo sin abonos', () => {
    expect(esquemaMarcarPensiones.safeParse(base).success).toBe(true)
  })

  it('acepta pagados y abonos del mismo largo que los meses', () => {
    expect(esquemaMarcarPensiones.safeParse({ ...base, pagados: [10000], abonos: [5000] }).success).toBe(true)
  })

  it('rechaza abonos en cero o negativos, y arreglos de otro largo', () => {
    for (const malo of [{ abonos: [0] }, { abonos: [-1] }, { abonos: [100, 200] }, { pagados: [0, 0] }, { pagados: [-1] }, { abonos: [1.5] }]) {
      expect(esquemaMarcarPensiones.safeParse({ ...base, ...malo }).success, JSON.stringify(malo)).toBe(false)
    }
  })
})
