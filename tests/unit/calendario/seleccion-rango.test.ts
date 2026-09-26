import { describe, expect, it } from 'vitest'
import { DIAS_MAXIMOS_AUSENCIA } from '@/lib/ausencias/tipos'
import {
  SIN_SELECCION,
  diasYaMarcados,
  enSeleccion,
  errorSeleccion,
  extremoDeSeleccion,
  focoInicial,
  limitesAusencia,
  moverFoco,
  puedeIrAlMes,
  resumenSeleccion,
  semanasDelMes,
  tocarDia,
  type SeleccionRango,
} from '@/lib/calendario/seleccion-rango'

const rango = (desde: string | null, hasta: string | null): SeleccionRango => ({ desde, hasta })

describe('tocarDia', () => {
  it('el primer toque elige el primer día', () => {
    expect(tocarDia(SIN_SELECCION, '2026-10-14')).toEqual(rango('2026-10-14', null))
  })

  it('el segundo toque, igual o posterior, elige el último día', () => {
    expect(tocarDia(rango('2026-10-14', null), '2026-10-16')).toEqual(rango('2026-10-14', '2026-10-16'))
    expect(tocarDia(rango('2026-10-14', null), '2026-10-14')).toEqual(rango('2026-10-14', '2026-10-14'))
  })

  it('un segundo toque anterior al primero vuelve a empezar desde ese día', () => {
    expect(tocarDia(rango('2026-10-14', null), '2026-10-10')).toEqual(rango('2026-10-10', null))
  })

  it('con el rango completo, un toque vuelve a empezar', () => {
    expect(tocarDia(rango('2026-10-14', '2026-10-16'), '2026-10-20')).toEqual(rango('2026-10-20', null))
    expect(tocarDia(rango('2026-10-14', '2026-10-16'), '2026-10-15')).toEqual(rango('2026-10-15', null))
  })
})

describe('enSeleccion y extremoDeSeleccion', () => {
  it('sin selección no hay nada', () => {
    expect(enSeleccion(SIN_SELECCION, '2026-10-14')).toBe(false)
    expect(extremoDeSeleccion(SIN_SELECCION, '2026-10-14')).toBeNull()
  })

  it('con solo el primer día, solo ese día', () => {
    const s = rango('2026-10-14', null)
    expect(enSeleccion(s, '2026-10-14')).toBe(true)
    expect(enSeleccion(s, '2026-10-15')).toBe(false)
    expect(extremoDeSeleccion(s, '2026-10-14')).toBe('desde')
  })

  it('un rango incluye sus dos extremos y lo del medio', () => {
    const s = rango('2026-09-29', '2026-10-02')
    expect(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03'].map((f) => enSeleccion(s, f))).toEqual([
      false, true, true, true, true, false,
    ])
    expect(extremoDeSeleccion(s, '2026-09-29')).toBe('desde')
    expect(extremoDeSeleccion(s, '2026-10-01')).toBeNull()
    expect(extremoDeSeleccion(s, '2026-10-02')).toBe('hasta')
  })
})

describe('limitesAusencia', () => {
  it(`de hoy a hoy + ${DIAS_MAXIMOS_AUSENCIA} días`, () => {
    expect(limitesAusencia('2026-09-26')).toEqual({ min: '2026-09-26', max: '2027-09-26' })
  })
})

describe('moverFoco', () => {
  const min = '2026-09-26'
  const max = '2027-09-26'

  it('flechas: un día a los lados, una semana arriba y abajo', () => {
    expect(moverFoco('2026-10-14', 'ArrowRight', min, max)).toBe('2026-10-15')
    expect(moverFoco('2026-10-14', 'ArrowLeft', min, max)).toBe('2026-10-13')
    expect(moverFoco('2026-10-14', 'ArrowDown', min, max)).toBe('2026-10-21')
    expect(moverFoco('2026-10-14', 'ArrowUp', min, max)).toBe('2026-10-07')
    expect(moverFoco('2026-10-31', 'ArrowRight', min, max)).toBe('2026-11-01')
  })

  it('Inicio y Fin: lunes y domingo de esa semana', () => {
    expect(moverFoco('2026-10-14', 'Home', min, max)).toBe('2026-10-12')
    expect(moverFoco('2026-10-14', 'End', min, max)).toBe('2026-10-18')
  })

  it('RePág y AvPág: mismo día del mes anterior o siguiente, sin pasarse del último día', () => {
    expect(moverFoco('2026-10-14', 'PageDown', min, max)).toBe('2026-11-14')
    expect(moverFoco('2026-11-14', 'PageUp', min, max)).toBe('2026-10-14')
    expect(moverFoco('2027-01-31', 'PageDown', min, max)).toBe('2027-02-28')
    expect(moverFoco('2027-03-31', 'PageUp', min, max)).toBe('2027-02-28')
    expect(moverFoco('2026-12-15', 'PageDown', min, max)).toBe('2027-01-15')
  })

  it('nunca sale de los límites', () => {
    expect(moverFoco('2026-09-26', 'ArrowLeft', min, max)).toBe('2026-09-26')
    expect(moverFoco('2026-09-28', 'ArrowUp', min, max)).toBe('2026-09-26')
    expect(moverFoco('2026-09-30', 'PageUp', min, max)).toBe('2026-09-26')
    expect(moverFoco('2026-09-27', 'Home', min, max)).toBe('2026-09-26')
    expect(moverFoco('2027-09-26', 'ArrowRight', min, max)).toBe('2027-09-26')
    expect(moverFoco('2027-09-20', 'ArrowDown', min, max)).toBe('2027-09-26')
    expect(moverFoco('2027-09-01', 'PageDown', min, max)).toBe('2027-09-26')
  })

  it('otra tecla no mueve nada', () => {
    expect(moverFoco('2026-10-14', 'Enter', min, max)).toBeNull()
    expect(moverFoco('2026-10-14', 'a', min, max)).toBeNull()
  })
})

describe('semanasDelMes', () => {
  it('solo las semanas con algún día del mes; los días de otro mes quedan vacíos', () => {
    // Septiembre de 2026 empieza en martes y termina en miércoles: 5 semanas.
    const semanas = semanasDelMes('2026-09')
    expect(semanas).toHaveLength(5)
    expect(semanas.every((s) => s.length === 7)).toBe(true)
    expect(semanas[0]).toEqual([null, '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06'])
    expect(semanas[4]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', null, null, null, null])
  })

  it('febrero de 2021 (lunes a domingo, 28 días) ocupa 4 semanas', () => {
    expect(semanasDelMes('2021-02')).toHaveLength(4)
  })

  it('un mes de 31 días que empieza en domingo ocupa 6 semanas', () => {
    const semanas = semanasDelMes('2026-03')
    expect(semanas).toHaveLength(6)
    expect(semanas[5]).toEqual(['2026-03-30', '2026-03-31', null, null, null, null, null])
  })
})

describe('focoInicial', () => {
  const limites = { min: '2026-09-26', max: '2027-09-26' }

  it('el primer día elegido, si está en el mes', () => {
    expect(focoInicial('2026-10', { ...limites, hoy: '2026-09-26', seleccion: rango('2026-10-14', '2026-10-20') })).toBe('2026-10-14')
  })

  it('si no, hoy, si está en el mes', () => {
    expect(focoInicial('2026-09', { ...limites, hoy: '2026-09-26', seleccion: rango('2026-10-14', null) })).toBe('2026-09-26')
  })

  it('si no, el primer día que se puede elegir del mes', () => {
    expect(focoInicial('2026-11', { ...limites, hoy: '2026-09-26', seleccion: SIN_SELECCION })).toBe('2026-11-01')
    expect(focoInicial('2027-09', { ...limites, hoy: '2026-09-26', seleccion: SIN_SELECCION })).toBe('2027-09-01')
  })

  it('un mes fuera de los límites no tiene foco', () => {
    expect(focoInicial('2026-08', { ...limites, hoy: '2026-09-26', seleccion: SIN_SELECCION })).toBeNull()
    expect(focoInicial('2027-10', { ...limites, hoy: '2026-09-26', seleccion: SIN_SELECCION })).toBeNull()
  })
})

describe('puedeIrAlMes', () => {
  it('no deja ir antes del mes de min ni después del de max', () => {
    expect(puedeIrAlMes('2026-09', '2026-09-26', '2027-09-26')).toEqual({ anterior: false, siguiente: true })
    expect(puedeIrAlMes('2027-02', '2026-09-26', '2027-09-26')).toEqual({ anterior: true, siguiente: true })
    expect(puedeIrAlMes('2027-09', '2026-09-26', '2027-09-26')).toEqual({ anterior: true, siguiente: false })
  })
})

describe('resumenSeleccion', () => {
  it('sin días elegidos', () => {
    expect(resumenSeleccion(SIN_SELECCION)).toBe('Todavía no elegiste ningún día.')
  })

  it('con solo el primer día: vale como un día, y dice cómo agregar más', () => {
    expect(resumenSeleccion(rango('2026-10-14', null))).toBe('El 14 de octubre: un solo día. Si son más días, tocá el último.')
  })

  it('el mismo día dos veces es un solo día', () => {
    expect(resumenSeleccion(rango('2026-10-14', '2026-10-14'))).toBe('El 14 de octubre: un solo día.')
  })

  it('un rango, con la cantidad de días', () => {
    expect(resumenSeleccion(rango('2026-10-14', '2026-10-16'))).toBe('Del 14 al 16 de octubre (3 días).')
    expect(resumenSeleccion(rango('2026-09-30', '2026-10-02'))).toBe('Del 30 de septiembre al 2 de octubre (3 días).')
    expect(resumenSeleccion(rango('2026-12-28', '2027-01-03'))).toBe('Del 28 de diciembre de 2026 al 3 de enero de 2027 (7 días).')
  })

  it('un rango que ya estaba marcado en parte lo dice', () => {
    const ausencias = [{ desde: '2026-10-14', hasta: '2026-10-15' }]
    expect(resumenSeleccion(rango('2026-10-12', '2026-10-16'), ausencias)).toBe(
      'Del 12 al 16 de octubre (5 días). Algunos de esos días ya estaban marcados.',
    )
    // Sin ningún día marcado, o con todos marcados (eso lo dice errorSeleccion), no agrega nada.
    expect(resumenSeleccion(rango('2026-10-20', '2026-10-21'), ausencias)).toBe('Del 20 al 21 de octubre (2 días).')
    expect(resumenSeleccion(rango('2026-10-14', '2026-10-15'), ausencias)).toBe('Del 14 al 15 de octubre (2 días).')
  })
})

describe('diasYaMarcados', () => {
  const ausencias = [
    { desde: '2026-10-14', hasta: '2026-10-15' },
    { desde: '2026-10-20', hasta: '2026-10-20' },
  ]

  it('sin días elegidos, nada', () => {
    expect(diasYaMarcados(SIN_SELECCION, ausencias)).toEqual({ elegidos: 0, marcados: 0 })
  })

  it('cuenta los días elegidos y cuántos ya caen en una ausencia', () => {
    expect(diasYaMarcados(rango('2026-10-14', null), ausencias)).toEqual({ elegidos: 1, marcados: 1 })
    expect(diasYaMarcados(rango('2026-10-13', '2026-10-21'), ausencias)).toEqual({ elegidos: 9, marcados: 3 })
    expect(diasYaMarcados(rango('2026-10-14', '2026-10-15'), ausencias)).toEqual({ elegidos: 2, marcados: 2 })
    expect(diasYaMarcados(rango('2026-10-16', '2026-10-19'), [])).toEqual({ elegidos: 4, marcados: 0 })
  })
})

describe('errorSeleccion', () => {
  it('nada que objetar en un rango normal o sin elegir', () => {
    expect(errorSeleccion(SIN_SELECCION)).toBeNull()
    expect(errorSeleccion(rango('2026-10-14', null))).toBeNull()
    expect(errorSeleccion(rango('2026-01-01', '2027-01-01'))).toBeNull()
  })

  it(`más de ${DIAS_MAXIMOS_AUSENCIA} días después del primero: el mismo límite que la base`, () => {
    expect(errorSeleccion(rango('2026-01-01', '2027-01-02'))).toBe('Una ausencia puede durar hasta un año.')
  })

  describe('días que ya estaban marcados', () => {
    const ausencias = [{ desde: '2026-10-14', hasta: '2026-10-16' }]

    it('si todos lo estaban, no hay nada que guardar: se quitan con «Quitar»', () => {
      expect(errorSeleccion(rango('2026-10-14', '2026-10-16'), ausencias)).toBe(
        'Esos días ya los tenés marcados. Para quitarlos, usá «Quitar» arriba.',
      )
      expect(errorSeleccion(rango('2026-10-15', null), ausencias)).toBe(
        'Ese día ya lo tenés marcado. Para quitarlo, usá «Quitar» arriba.',
      )
      expect(errorSeleccion(rango('2026-10-15', '2026-10-15'), ausencias)).toBe(
        'Ese día ya lo tenés marcado. Para quitarlo, usá «Quitar» arriba.',
      )
    })

    it('mirando las ausencias de otra persona (La casa), en tercera persona', () => {
      expect(errorSeleccion(rango('2026-10-14', '2026-10-16'), ausencias, 'ajena')).toBe(
        'Esos días ya los tiene marcados. Para quitarlos, usá «Quitar» arriba.',
      )
      expect(errorSeleccion(rango('2026-10-15', null), ausencias, 'ajena')).toBe(
        'Ese día ya lo tiene marcado. Para quitarlo, usá «Quitar» arriba.',
      )
    })

    it('si solo algunos lo estaban, se puede guardar (sirve para alargar una ausencia)', () => {
      expect(errorSeleccion(rango('2026-10-14', '2026-10-18'), ausencias)).toBeNull()
      expect(errorSeleccion(rango('2026-10-10', '2026-10-14'), ausencias)).toBeNull()
    })
  })
})
