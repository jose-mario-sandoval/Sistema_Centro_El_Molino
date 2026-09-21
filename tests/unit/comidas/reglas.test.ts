import { describe, expect, it } from 'vitest'
import casos from '@/tests/fixtures/casos-comidas.json'
import { cierreDe, enVentanaEditable, estaAbierta, valorEfectivo } from '@/lib/comidas/reglas'
import { HORAS_LIMITE_POR_DEFECTO, type HorasLimite, type TiempoComida } from '@/lib/comidas/tipos'

describe('cierreDe', () => {
  it.each(casos.cierres)('$comida del $fecha cierra en $cierre', ({ fecha, comida, cierre }) => {
    expect(cierreDe(fecha, comida as TiempoComida, HORAS_LIMITE_POR_DEFECTO).toISOString()).toBe(cierre)
  })
})

describe('estaAbierta', () => {
  it.each(casos.abiertas)('$nombre', ({ ahora, fecha, comida, cerrada, horas, abierta }) => {
    expect(
      estaAbierta({
        fecha,
        comida: comida as TiempoComida,
        ahora: new Date(ahora),
        horas: (horas as HorasLimite | null) ?? HORAS_LIMITE_POR_DEFECTO,
        cerrada,
      }),
    ).toBe(abierta)
  })
})

describe('enVentanaEditable', () => {
  const ahora = new Date('2026-09-16T08:00:00-06:00')
  it('incluye desde el lunes actual hasta el domingo siguiente', () => {
    expect(enVentanaEditable('2026-09-13', ahora)).toBe(false)
    expect(enVentanaEditable('2026-09-14', ahora)).toBe(true)
    expect(enVentanaEditable('2026-09-27', ahora)).toBe(true)
    expect(enVentanaEditable('2026-09-28', ahora)).toBe(false)
  })
})

describe('valorEfectivo', () => {
  const plan = { estado: 'si' as const, nota: null }
  const seleccion = { estado: 'tarde' as const, nota: '13:30', origen: 'persona' as const }

  it('usa la selección si existe', () => {
    expect(valorEfectivo({ seleccion, plan, cerrada: false })).toEqual(seleccion)
    expect(valorEfectivo({ seleccion, plan, cerrada: true })).toEqual(seleccion)
  })

  it('usa el plan si no hay selección y la comida no cerró', () => {
    expect(valorEfectivo({ seleccion: null, plan, cerrada: false })).toEqual({ ...plan, origen: 'plan' })
  })

  it('queda sin definir si la comida cerró sin selección', () => {
    expect(valorEfectivo({ seleccion: null, plan, cerrada: true })).toBeNull()
  })

  it('queda sin definir si no hay selección ni plan', () => {
    expect(valorEfectivo({ seleccion: null, plan: null, cerrada: false })).toBeNull()
  })
})

describe('valorEfectivo: ausencia', () => {
  const plan = { estado: 'si', nota: null } as const

  it('la ausencia cancela la comida y gana sobre el plan', () => {
    expect(valorEfectivo({ seleccion: null, plan, cerrada: false, ausente: true })).toEqual({
      estado: 'no',
      nota: null,
      origen: 'ausencia',
    })
  })

  it('cancela también cuando no hay plan', () => {
    expect(valorEfectivo({ seleccion: null, plan: null, cerrada: false, ausente: true })).toMatchObject({ estado: 'no' })
  })

  it('una elección de la persona gana sobre la ausencia', () => {
    const seleccion = { estado: 'si', nota: null, origen: 'persona' } as const
    expect(valorEfectivo({ seleccion, plan, cerrada: false, ausente: true })).toEqual(seleccion)
  })

  it('cerrada y sin selección congelada no es "No comer": la ausencia solo cuenta mientras está abierta', () => {
    expect(valorEfectivo({ seleccion: null, plan, cerrada: true, ausente: true })).toBeNull()
  })

  it('sin indicar la ausencia todo sigue igual', () => {
    expect(valorEfectivo({ seleccion: null, plan, cerrada: false })).toEqual({ ...plan, origen: 'plan' })
  })
})
