import { describe, expect, it } from 'vitest'
import casos from '@/tests/fixtures/casos-comidas.json'
import { cierreDe, comidaSinCerrar, enVentanaEditable, estaAbierta, valorEfectivo } from '@/lib/comidas/reglas'
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

describe('comidaSinCerrar: casos compartidos con la paridad de SQL (tests/fixtures/casos-comidas.json)', () => {
  it.each(casos.sinCerrar)('$nombre', ({ ahora, fecha, comida, cerrada, horas, sinCerrar }) => {
    expect(
      comidaSinCerrar({
        fecha,
        comida: comida as TiempoComida,
        ahora: new Date(ahora),
        horas: (horas as HorasLimite | null) ?? HORAS_LIMITE_POR_DEFECTO,
        cerrada,
      }),
    ).toBe(sinCerrar)
  })
})

describe('comidaSinCerrar (espejo de public.comida_sin_cerrar: quitar un extra)', () => {
  const ahora = new Date('2026-09-16T08:00:00-06:00') // miércoles 08:00
  const base = { ahora, horas: HORAS_LIMITE_POR_DEFECTO, cerrada: false }

  it('antes de la hora límite: sin cerrar', () => {
    expect(comidaSinCerrar({ ...base, fecha: '2026-09-16', comida: 'almuerzo' })).toBe(true)
  })

  it('después de la hora límite: cerró (el desayuno de hoy cerró anoche)', () => {
    expect(comidaSinCerrar({ ...base, fecha: '2026-09-16', comida: 'desayuno' })).toBe(false)
    expect(comidaSinCerrar({ ...base, fecha: '2026-09-15', comida: 'cena' })).toBe(false)
  })

  it('justo a la hora límite ya cerró', () => {
    expect(comidaSinCerrar({ ...base, ahora: new Date('2026-09-16T10:00:00-06:00'), fecha: '2026-09-16', comida: 'almuerzo' })).toBe(false)
  })

  it('si el job la cerró, cerró aunque falte para la hora', () => {
    expect(comidaSinCerrar({ ...base, cerrada: true, fecha: '2026-09-16', comida: 'almuerzo' })).toBe(false)
  })

  it('a diferencia de estaAbierta, no mira la ventana editable: después de los tres meses sigue sin cerrar', () => {
    expect(comidaSinCerrar({ ...base, fecha: '2026-12-17', comida: 'cena' })).toBe(true)
    expect(estaAbierta({ ...base, fecha: '2026-12-17', comida: 'cena' })).toBe(false)
  })
})

describe('enVentanaEditable', () => {
  const ahora = new Date('2026-09-16T08:00:00-06:00')
  it('incluye desde hoy hasta tres meses calendario, sin extenderse al fin de semana', () => {
    expect(enVentanaEditable('2026-09-13', ahora)).toBe(false)
    expect(enVentanaEditable('2026-09-14', ahora)).toBe(false)
    expect(enVentanaEditable('2026-09-15', ahora)).toBe(false)
    expect(enVentanaEditable('2026-09-16', ahora)).toBe(true)
    expect(enVentanaEditable('2026-09-27', ahora)).toBe(true)
    expect(enVentanaEditable('2026-09-28', ahora)).toBe(true)
    expect(enVentanaEditable('2026-12-16', ahora)).toBe(true)
    expect(enVentanaEditable('2026-12-17', ahora)).toBe(false)
    expect(enVentanaEditable('2026-12-20', ahora)).toBe(false)
  })

  it.each([
    ['2026-10-31', '2027-01-31', '2027-02-01'],
    ['2026-01-31', '2026-04-30', '2026-05-01'],
    ['2026-11-30', '2027-02-28', '2027-03-01'],
    ['2027-11-30', '2028-02-29', '2028-03-01'],
  ])('ajusta el último día desde %s: permite %s y bloquea %s', (hoy, ultimo, posterior) => {
    const ahora = new Date(`${hoy}T08:00:00-06:00`)
    expect(enVentanaEditable(ultimo, ahora)).toBe(true)
    expect(enVentanaEditable(posterior, ahora)).toBe(false)
  })

  it('toma hoy y el límite de la zona del proyecto, y avanza al cambiar la fecha local', () => {
    const antesDeMedianoche = new Date('2026-10-16T05:59:59Z')
    const medianoche = new Date('2026-10-16T06:00:00Z')
    expect(enVentanaEditable('2026-10-15', antesDeMedianoche)).toBe(true)
    expect(enVentanaEditable('2027-01-15', antesDeMedianoche)).toBe(true)
    expect(enVentanaEditable('2027-01-16', antesDeMedianoche)).toBe(false)
    expect(enVentanaEditable('2026-10-15', medianoche)).toBe(false)
    expect(enVentanaEditable('2027-01-16', medianoche)).toBe(true)
  })
})

describe('estaAbierta: nuevo período sin alterar cierres', () => {
  const base = { ahora: new Date('2026-09-16T08:00:00-06:00'), horas: HORAS_LIMITE_POR_DEFECTO, cerrada: false }

  it.each(['desayuno', 'almuerzo', 'cena'] as const)('permite %s el último día y bloquea el posterior', (comida) => {
    expect(estaAbierta({ ...base, fecha: '2026-12-16', comida })).toBe(true)
    expect(estaAbierta({ ...base, fecha: '2026-12-17', comida })).toBe(false)
  })

  it('el cierre explícito también bloquea una comida futura dentro del período', () => {
    expect(estaAbierta({ ...base, fecha: '2026-12-16', comida: 'almuerzo', cerrada: true })).toBe(false)
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

  it('deja pasar quién la cambió: "la cambió el Director" sigue a la selección', () => {
    const delDirector = { ...seleccion, cambiadaPorOtro: true }
    expect(valorEfectivo({ seleccion: delDirector, plan, cerrada: false })).toEqual(delDirector)
    expect(valorEfectivo({ seleccion: delDirector, plan, cerrada: true, ausente: true })).toEqual(delDirector)
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
