import { describe, expect, it } from 'vitest'
import { centavosDesdeTexto, mesActual, nombreMes, resumenAnual, resumenPresupuesto, seleccionPagable } from '@/lib/pensiones/calculos'
import { apartadosPensiones, puedeVerPensiones } from '@/lib/pensiones/permisos'
import { esquemaCuotaPension, esquemaMarcarPensiones, esquemaPeriodoPension } from '@/lib/validacion/pensiones'
import type { FilaPresupuesto, MesPension } from '@/lib/pensiones/tipos'

const mes = (periodo: string, monto: number | null, pagado = 0): MesPension => ({ periodo, monto_centavos: monto, pagado_centavos: pagado, categoria: monto === null ? null : 'universitario', registrado_en: null })
describe('dinero y selección de pensiones', () => {
  it('convierte dólares a centavos exactos y rechaza formatos ambiguos', () => {
    expect(centavosDesdeTexto('0.29')).toBe(29)
    expect(centavosDesdeTexto('300.1')).toBe(30010)
    expect(centavosDesdeTexto('1000000.00')).toBe(100000000)
    for (const n of ['0', '-3', '1.001', '1e2', '1,20', 'NaN', 'Infinity', '1000000.01', '']) expect(centavosDesdeTexto(n)).toBeNull()
  })
  it('permite cuotas distintas de una misma categoría y calcula cada mes', () => {
    const meses = [mes('2026-10-01', 30000), mes('2026-11-01', 40000)]
    expect(seleccionPagable(meses, meses.map((m) => m.periodo))).toMatchObject({ valido: true, total: 70000 })
  })
  it('rechaza duplicados, pagados, desconocidos y meses sin cuota', () => {
    const meses = [mes('2026-10-01', 30000, 30000), mes('2026-11-01', null)]
    for (const periodos of [[], ['2026-10-01'], ['2026-11-01'], ['2026-12-01'], ['2026-10-01', '2026-10-01']]) expect(seleccionPagable(meses, periodos).valido).toBe(false)
  })
  it('usa el cambio de mes de El Salvador y no UTC', () => {
    expect(mesActual(new Date('2027-01-01T05:59:59Z'))).toBe('2026-12-01')
    expect(mesActual(new Date('2027-01-01T06:00:00Z'))).toBe('2027-01-01')
  })
  it('suma pagos y metas del período seleccionado, admite meta cero', () => {
    expect(resumenPresupuesto([mes('2026-10-01', 30000, 30000), mes('2026-10-01', 40000)])).toEqual({ meta: 70000, pagado: 30000, falta: 40000, porcentaje: 30000 / 70000 * 100 })
    expect(resumenPresupuesto([])).toEqual({ meta: 0, pagado: 0, falta: 0, porcentaje: 0 })
    expect(resumenPresupuesto([mes('2026-11-01', 30000, 40000)])).toMatchObject({ falta: 0, porcentaje: 100 })
  })
})

describe('permisos y validación', () => {
  it('Administración carece de Pensiones y Administradora solo tiene Presupuesto y Reporte', () => {
    expect(puedeVerPensiones('administracion')).toBe(false)
    expect(apartadosPensiones('administracion')).toEqual([])
    expect(apartadosPensiones('administradora').map((p) => p.etiqueta)).toEqual(['Presupuesto', 'Reporte'])
    expect(apartadosPensiones('residente').map((p) => p.etiqueta)).toEqual(['Marcar pensiones'])
    expect(apartadosPensiones('director')).toHaveLength(4)
  })
  it('limita períodos, tamaño de la selección y montos de confirmación', () => {
    expect(esquemaPeriodoPension.safeParse('2200-12-01').success).toBe(true)
    for (const p of ['2026-13-01', '2026-10-02', '1999-12-01', '2201-01-01']) expect(esquemaPeriodoPension.safeParse(p).success).toBe(false)
    expect(esquemaMarcarPensiones.safeParse({ periodos: ['2026-10-01', '2026-10-01'], montos: [1, 1] }).success).toBe(false)
    expect(esquemaMarcarPensiones.safeParse({ periodos: ['2026-10-01'], montos: [] }).success).toBe(false)
  })
  it('la categoría no depende del rol y el monto es individual', () => {
    const base = { usuario_id: '0b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', desde: '2026-10-01', categoria: 'universitario' }
    expect(esquemaCuotaPension.parse({ ...base, monto: '300' }).monto).toBe(30000)
    expect(esquemaCuotaPension.parse({ ...base, monto: '400' }).monto).toBe(40000)
  })
})

const fila = (periodo: string, usuario: string, etiqueta: string, monto: number | null, pagado = 0): FilaPresupuesto => ({
  periodo, usuario_id: usuario, etiqueta, categoria: monto === null ? null : 'universitario', monto_centavos: monto, pagado_centavos: pagado, registrado_en: null,
})

describe('presupuesto de un año', () => {
  const mesesDelAnio = (porMes: (indice: number) => FilaPresupuesto[]) => Array.from({ length: 12 }, (_, i) => porMes(i))
  const periodo = (i: number) => `2027-${String(i + 1).padStart(2, '0')}-01`

  it('nombra el mes con mayúscula', () => {
    expect(nombreMes('2027-01-01')).toBe('Enero')
    expect(nombreMes('2027-12-01')).toBe('Diciembre')
  })

  it('suma el año y cada mes: la meta y lo pagado', () => {
    const r = resumenAnual(mesesDelAnio((i) => [fila(periodo(i), 'a', 'AAA', 30000, i < 2 ? 30000 : 0), fila(periodo(i), 'b', 'BBB', 20000, i === 0 ? 10000 : 0)]))
    expect(r.meses).toHaveLength(12)
    expect(r.meses[0]).toMatchObject({ periodo: '2027-01-01', meta: 50000, pagado: 40000, falta: 10000 })
    expect(r.meses[1]).toMatchObject({ meta: 50000, pagado: 30000, falta: 20000 })
    expect(r.meses[5]).toMatchObject({ meta: 50000, pagado: 0, porcentaje: 0 })
    expect(r.total).toMatchObject({ meta: 600000, pagado: 70000, falta: 530000 })
  })

  it('suma por persona solo los meses en que le corresponde pagar', () => {
    // 'b' entra en julio: solo suma 6 meses.
    const r = resumenAnual(mesesDelAnio((i) => [fila(periodo(i), 'a', 'AAA', 30000, 30000), ...(i >= 6 ? [fila(periodo(i), 'b', 'BBB', 20000, 5000)] : [])]))
    expect(r.personas).toEqual([
      expect.objectContaining({ etiqueta: 'AAA', meta: 360000, pagado: 360000, falta: 0 }),
      expect.objectContaining({ etiqueta: 'BBB', meta: 120000, pagado: 30000, falta: 90000 }),
    ])
  })

  it('un año sin filas da todo en cero y 12 meses vacíos', () => {
    const r = resumenAnual(mesesDelAnio(() => []))
    expect(r.total).toEqual({ meta: 0, pagado: 0, falta: 0, porcentaje: 0 })
    expect(r.personas).toEqual([])
    expect(r.meses.every((m) => m.meta === 0 && m.periodo === null)).toBe(true)
  })

  it('avisa quién no tuvo cuota en algún mes, sin repetir', () => {
    const r = resumenAnual(mesesDelAnio((i) => [fila(periodo(i), 'c', 'CCC', i < 3 ? null : 10000)]))
    expect(r.sinCuota).toEqual(['CCC'])
    expect(r.total.meta).toBe(90000)
  })

  it('ordena a las personas por etiqueta', () => {
    const r = resumenAnual([[fila('2027-01-01', 'z', 'ZZZ', 1000), fila('2027-01-01', 'a', 'AAA', 1000)], ...Array.from({ length: 11 }, () => [])])
    expect(r.personas.map((p) => p.etiqueta)).toEqual(['AAA', 'ZZZ'])
  })
})
