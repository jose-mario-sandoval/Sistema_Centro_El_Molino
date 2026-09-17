import { describe, expect, it } from 'vitest'
import {
  diaPedido,
  diasDeSemana,
  esFechaISO,
  etiquetaDia,
  fechaCorta,
  mensajeComidaCerrada,
  navegacionSemana,
  rangoSemana,
  semanaPedida,
  textoCierre,
  tipoSemana,
} from '@/lib/comidas/semana'
import { HORAS_LIMITE_POR_DEFECTO, type TiempoComida } from '@/lib/comidas/tipos'

const HOY = '2026-09-16'
const horas = HORAS_LIMITE_POR_DEFECTO

describe('esFechaISO', () => {
  it('acepta fechas reales YYYY-MM-DD', () => {
    expect(esFechaISO('2026-09-16')).toBe(true)
    expect(esFechaISO('2028-02-29')).toBe(true)
  })

  it.each([['2026-02-30'], ['16/09/2026'], ['2026-9-16'], ['1999-12-31'], [undefined], [['2026-09-16']]])(
    'rechaza %j',
    (valor) => {
      expect(esFechaISO(valor)).toBe(false)
    },
  )
})

describe('etiquetas', () => {
  it('nombre del día y fecha corta sin ceros', () => {
    expect(etiquetaDia('2026-09-23')).toBe('Miércoles 23/9')
    expect(etiquetaDia('2026-10-04')).toBe('Domingo 4/10')
    expect(fechaCorta('2026-01-05')).toBe('5/1')
  })

  it('rango de la semana que cruza de mes', () => {
    expect(rangoSemana('2026-09-28')).toBe('28/9 — 4/10')
  })

  it('diasDeSemana devuelve los 7 días desde el lunes', () => {
    expect(diasDeSemana('2026-09-28')).toEqual([
      '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
    ])
  })
})

describe('semanaPedida', () => {
  it.each([
    ['sin parámetro', undefined, '2026-09-14'],
    ['lunes de la semana siguiente', '2026-09-21', '2026-09-21'],
    ['jueves de la semana siguiente', '2026-09-24', '2026-09-21'],
    ['semana pasada', '2026-09-07', '2026-09-07'],
    ['dentro de dos semanas', '2026-09-28', '2026-09-14'],
    ['texto inválido', 'basura', '2026-09-14'],
    ['fecha inexistente', '2026-02-30', '2026-09-14'],
    ['parámetro repetido', ['2026-09-21', '2026-09-28'], '2026-09-14'],
  ])('%s', (_caso, valor, esperado) => {
    expect(semanaPedida(valor, HOY)).toBe(esperado)
  })

  it('el domingo, la semana siguiente sigue siendo la del lunes de mañana', () => {
    expect(semanaPedida('2026-09-21', '2026-09-20')).toBe('2026-09-21')
    expect(semanaPedida('2026-09-28', '2026-09-20')).toBe('2026-09-14')
  })
})

describe('tipoSemana y navegacionSemana', () => {
  it('clasifica la semana respecto de hoy', () => {
    expect(tipoSemana('2026-09-07', HOY)).toBe('pasada')
    expect(tipoSemana('2026-09-14', HOY)).toBe('actual')
    expect(tipoSemana('2026-09-21', HOY)).toBe('siguiente')
  })

  it('no permite avanzar más allá de la semana siguiente', () => {
    expect(navegacionSemana('2026-08-31', HOY)).toEqual({ anterior: '2026-08-24', siguiente: '2026-09-07', tipo: 'pasada' })
    expect(navegacionSemana('2026-09-14', HOY)).toEqual({ anterior: '2026-09-07', siguiente: '2026-09-21', tipo: 'actual' })
    expect(navegacionSemana('2026-09-21', HOY)).toEqual({ anterior: '2026-09-14', siguiente: null, tipo: 'siguiente' })
  })
})

describe('diaPedido', () => {
  it.each([
    ['día válido de la semana', '2026-09-23', '2026-09-21', '2026-09-23'],
    ['sin día en la semana siguiente → lunes', undefined, '2026-09-21', '2026-09-21'],
    ['sin día en la semana actual → hoy', undefined, '2026-09-14', '2026-09-16'],
    ['día de otra semana → lunes', '2026-09-30', '2026-09-21', '2026-09-21'],
    ['día inválido en la semana actual → hoy', 'basura', '2026-09-14', '2026-09-16'],
  ])('%s', (_caso, valor, lunes, esperado) => {
    expect(diaPedido(valor, lunes, HOY)).toBe(esperado)
  })
})

describe('textoCierre', () => {
  const ahora = new Date('2026-09-16T08:00:00-06:00')

  it.each([
    ['2026-09-16', 'almuerzo', 'cierra hoy 10:00'],
    ['2026-09-17', 'desayuno', 'cierra hoy 21:00'],
    ['2026-09-17', 'almuerzo', 'cierra mañana 10:00'],
    ['2026-09-18', 'desayuno', 'cierra mañana 21:00'],
    ['2026-09-23', 'almuerzo', 'cierra mié 23/9 10:00'],
    ['2026-09-21', 'desayuno', 'cierra dom 20/9 21:00'],
    ['2026-09-15', 'cena', 'cerrada'],
  ])('%s %s → %s', (fecha, comida, esperado) => {
    expect(textoCierre({ fecha, comida: comida as TiempoComida, ahora, horas, cerrada: false })).toBe(esperado)
  })

  it('una comida marcada como cerrada dice "cerrada" aunque falte para la hora', () => {
    expect(textoCierre({ fecha: '2026-09-16', comida: 'cena', ahora, horas, cerrada: true })).toBe('cerrada')
  })

  it('justo a la hora límite ya está cerrada', () => {
    const alCierre = new Date('2026-09-16T10:00:00-06:00')
    expect(textoCierre({ fecha: '2026-09-16', comida: 'almuerzo', ahora: alCierre, horas, cerrada: false })).toBe('cerrada')
  })

  it('usa la fecha local y no la UTC para "hoy" y "mañana"', () => {
    const noche = new Date('2026-09-16T23:30:00-06:00')
    expect(textoCierre({ fecha: '2026-09-17', comida: 'almuerzo', ahora: noche, horas, cerrada: false })).toBe('cierra mañana 10:00')
  })
})

describe('mensajeComidaCerrada', () => {
  it.each([
    ['2026-09-16T10:30:00-06:00', '2026-09-16', 'almuerzo', 'El almuerzo ya cerró a las 10:00.'],
    ['2026-09-16T21:30:00-06:00', '2026-09-17', 'desayuno', 'El desayuno ya cerró a las 21:00 del día anterior.'],
    ['2026-09-16T16:30:00-06:00', '2026-09-16', 'cena', 'La cena ya cerró a las 16:00.'],
    ['2026-09-16T08:00:00-06:00', '2026-09-16', 'cena', 'La cena ya cerró.'],
    ['2026-09-16T08:00:00-06:00', '2026-09-13', 'cena', 'Solo podés cambiar la semana actual y la siguiente.'],
    ['2026-09-16T08:00:00-06:00', '2026-09-28', 'almuerzo', 'Solo podés cambiar la semana actual y la siguiente.'],
  ])('%s, %s %s', (ahora, fecha, comida, esperado) => {
    expect(mensajeComidaCerrada({ fecha, comida: comida as TiempoComida, ahora: new Date(ahora), horas })).toBe(esperado)
  })
})
