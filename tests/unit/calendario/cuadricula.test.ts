import { describe, expect, it } from 'vitest'
import {
  agruparPorFecha,
  aniosParaElegir,
  cuadriculaMes,
  esMesISO,
  etiquetaDia,
  etiquetaMes,
  mesAnterior,
  mesDe,
  mesDesdeSeleccion,
  mesSiguiente,
  rangoCuadricula,
} from '@/lib/calendario/cuadricula'
import { diaSemana, sumarDias } from '@/lib/fechas'

describe('mesDesdeSeleccion', () => {
  it('junta año y mes del selector, con el mes de una o dos cifras', () => {
    expect(mesDesdeSeleccion('2027', '3')).toBe('2027-03')
    expect(mesDesdeSeleccion('2027', '03')).toBe('2027-03')
    expect(mesDesdeSeleccion('2026', '12')).toBe('2026-12')
  })

  it('null si falta algo o no es válido: el calendario se queda en el mes de hoy', () => {
    for (const [anio, mes] of [[undefined, '3'], ['2027', undefined], ['2027', '0'], ['2027', '13'], ['1999', '5'], ['2100', '5'], ['abc', '5'], ['2027', 'x'], [['2027'], '3']]) {
      expect(mesDesdeSeleccion(anio, mes), `${String(anio)}-${String(mes)}`).toBeNull()
    }
  })
})

describe('aniosParaElegir', () => {
  it('de 10 años antes a 15 después de hoy', () => {
    const anios = aniosParaElegir('2026-10', '2026-10-13')
    expect(anios[0]).toBe(2016)
    expect(anios.at(-1)).toBe(2041)
  })

  it('siempre incluye el año que se está viendo, aunque quede lejos', () => {
    expect(aniosParaElegir('2005-03', '2026-10-13')[0]).toBe(2005)
    expect(aniosParaElegir('2060-03', '2026-10-13').at(-1)).toBe(2060)
  })

  it('nunca sale de 2000–2099', () => {
    const anios = aniosParaElegir('2095-01', '2095-06-01')
    expect(anios.at(-1)).toBe(2099)
    expect(aniosParaElegir('2003-01', '2003-06-01')[0]).toBe(2000)
  })
})

describe('cuadriculaMes', () => {
  it.each(['2026-06', '2026-02', '2026-09', '2027-01', '2028-02'])(
    '%s: 42 días consecutivos que empiezan en lunes',
    (mes) => {
      const dias = cuadriculaMes(mes)
      expect(dias).toHaveLength(42)
      expect(diaSemana(dias[0].fecha)).toBe(1)
      expect(diaSemana(dias[41].fecha)).toBe(7)
      dias.forEach((d, i) => expect(d.fecha).toBe(sumarDias(dias[0].fecha, i)))
    },
  )

  it('mes que empieza en lunes (junio 2026) no incluye días del mes anterior', () => {
    const dias = cuadriculaMes('2026-06')
    expect(dias[0]).toEqual({ fecha: '2026-06-01', dia: 1, enMes: true })
    expect(dias[29]).toEqual({ fecha: '2026-06-30', dia: 30, enMes: true })
    expect(dias[30]).toEqual({ fecha: '2026-07-01', dia: 1, enMes: false })
    expect(dias[41]).toEqual({ fecha: '2026-07-12', dia: 12, enMes: false })
  })

  it('mes que empieza en domingo (febrero 2026, 28 días)', () => {
    const dias = cuadriculaMes('2026-02')
    expect(dias[0]).toEqual({ fecha: '2026-01-26', dia: 26, enMes: false })
    expect(dias[5]).toEqual({ fecha: '2026-01-31', dia: 31, enMes: false })
    expect(dias[6]).toEqual({ fecha: '2026-02-01', dia: 1, enMes: true })
    expect(dias.filter((d) => d.enMes)).toHaveLength(28)
    expect(dias[41]).toEqual({ fecha: '2026-03-08', dia: 8, enMes: false })
  })

  it('febrero bisiesto (2028) incluye el 29', () => {
    const dias = cuadriculaMes('2028-02')
    expect(dias.filter((d) => d.enMes)).toHaveLength(29)
    expect(dias.find((d) => d.fecha === '2028-02-29')).toEqual({ fecha: '2028-02-29', dia: 29, enMes: true })
    expect(dias.find((d) => d.fecha === '2028-03-01')?.enMes).toBe(false)
  })

  it('cruce de año: enero 2027 empieza con días de diciembre 2026', () => {
    const dias = cuadriculaMes('2027-01')
    expect(dias[0]).toEqual({ fecha: '2026-12-28', dia: 28, enMes: false })
    expect(dias[4]).toEqual({ fecha: '2027-01-01', dia: 1, enMes: true })
    expect(dias.filter((d) => d.enMes)).toHaveLength(31)
  })
})

describe('rangoCuadricula', () => {
  it('va del primer lunes al último domingo de la cuadrícula', () => {
    expect(rangoCuadricula('2026-09')).toEqual({ desde: '2026-08-31', hasta: '2026-10-11' })
    expect(rangoCuadricula('2027-01')).toEqual({ desde: '2026-12-28', hasta: '2027-02-07' })
  })
})

describe('navegación entre meses', () => {
  it('mesAnterior y mesSiguiente dentro del año', () => {
    expect(mesAnterior('2026-09')).toBe('2026-08')
    expect(mesSiguiente('2026-09')).toBe('2026-10')
  })

  it('mesAnterior y mesSiguiente cruzan el año', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12')
    expect(mesSiguiente('2026-12')).toBe('2027-01')
  })

  it('mesDe toma el mes de una fecha', () => {
    expect(mesDe('2026-09-16')).toBe('2026-09')
  })
})

describe('esMesISO', () => {
  it('acepta solo YYYY-MM válidos', () => {
    expect(esMesISO('2026-09')).toBe(true)
    expect(esMesISO('2026-12')).toBe(true)
    expect(esMesISO('2026-13')).toBe(false)
    expect(esMesISO('2026-00')).toBe(false)
    expect(esMesISO('2026-9')).toBe(false)
    expect(esMesISO('1999-01')).toBe(false)
    expect(esMesISO(undefined)).toBe(false)
    expect(esMesISO(['2026-09'])).toBe(false)
  })
})

describe('etiquetas en español', () => {
  it('etiquetaMes', () => {
    expect(etiquetaMes('2026-09')).toBe('Septiembre de 2026')
    expect(etiquetaMes('2027-01')).toBe('Enero de 2027')
  })

  it('etiquetaDia', () => {
    expect(etiquetaDia('2026-09-16')).toBe('Miércoles, 16 de septiembre de 2026')
    expect(etiquetaDia('2027-01-01')).toBe('Viernes, 1 de enero de 2027')
  })
})

describe('agruparPorFecha', () => {
  it('agrupa conservando el orden', () => {
    const a = { id: 'a', fecha: '2026-09-16' }
    const b = { id: 'b', fecha: '2026-09-17' }
    const c = { id: 'c', fecha: '2026-09-16' }
    expect(agruparPorFecha([a, b, c])).toEqual({ '2026-09-16': [a, c], '2026-09-17': [b] })
    expect(agruparPorFecha([])).toEqual({})
  })
})
