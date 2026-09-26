import { describe, expect, it } from 'vitest'
import {
  diasParaExtra,
  etiquetaCeldaCasa,
  etiquetaGrupo,
  notasPorComida,
  pestanasComidas,
  textoExtra,
  tituloComidaCasa,
} from '@/lib/comidas/casa'
import { resumenComida } from '@/lib/comidas/resumen'

describe('pestanasComidas: "La casa" solo para el Director', () => {
  it('el Director ve Plan, Semana y La casa', () => {
    expect(pestanasComidas(true).map((p) => [p.ruta, p.etiqueta])).toEqual([
      ['/comidas/plan', 'Plan de comida'],
      ['/comidas/semana', 'Semana'],
      ['/comidas/casa', 'La casa'],
    ])
  })

  it('los demás, solo Plan y Semana', () => {
    expect(pestanasComidas(false).map((p) => p.ruta)).toEqual(['/comidas/plan', '/comidas/semana'])
  })
})

describe('tituloComidaCasa', () => {
  it.each([
    ['almuerzo', 'Almuerzo del miércoles 23/9'],
    ['cena', 'Cena del miércoles 23/9'],
    ['desayuno', 'Desayuno del miércoles 23/9'],
  ] as const)('%s → %s', (comida, esperado) => {
    expect(tituloComidaCasa(comida, 'Miércoles', '23/9')).toBe(esperado)
  })
})

describe('etiquetaCeldaCasa: nombre accesible del botón de una celda', () => {
  const resumen = resumenComida([
    { estado: 'si', nota: null, origen: 'plan' },
    { estado: 'temprano', nota: '07:30', origen: 'persona' },
    null,
  ])

  it('dice qué comida es, cuántos comen, cómo y qué hace tocarla', () => {
    expect(etiquetaCeldaCasa('almuerzo', 'Miércoles', '23/9', resumen)).toBe(
      'Almuerzo del miércoles 23/9: 2 comen. 1 temprano (07:30), 1 sí, 1 sin definir. Ver quiénes',
    )
  })

  it('con extras, los suma escritos', () => {
    expect(etiquetaCeldaCasa('cena', 'Viernes', '25/9', resumen, 3)).toBe(
      'Cena del viernes 25/9: 2 comen. 1 temprano (07:30), 1 sí, 1 sin definir. +3 extra. Ver quiénes',
    )
  })

  it('una sola persona: "come"; sin personas, lo dice', () => {
    expect(etiquetaCeldaCasa('cena', 'Viernes', '25/9', resumenComida([{ estado: 'si', nota: null, origen: 'plan' }]))).toBe(
      'Cena del viernes 25/9: 1 come. 1 sí. Ver quiénes',
    )
    expect(etiquetaCeldaCasa('cena', 'Viernes', '25/9', resumenComida([]))).toBe('Cena del viernes 25/9: 0 comen. Ver quiénes')
  })
})

describe('etiquetaGrupo', () => {
  it('"Sin definir (2)"', () => {
    expect(etiquetaGrupo('Sin definir', 2)).toBe('Sin definir (2)')
    expect(etiquetaGrupo('Comer temprano', 1)).toBe('Comer temprano (1)')
  })
})

describe('diasParaExtra: los días de la semana en que todavía se puede agregar un extra', () => {
  it('semana en curso: de hoy al domingo', () => {
    expect(diasParaExtra('2026-09-21', '2026-09-24')).toEqual(['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'])
  })

  it('semana que viene: los siete', () => {
    expect(diasParaExtra('2026-09-28', '2026-09-24')).toHaveLength(7)
  })

  it('semana pasada: ninguno', () => {
    expect(diasParaExtra('2026-09-14', '2026-09-24')).toEqual([])
  })
})

describe('textoExtra', () => {
  it('"Miércoles 23/9 · Cena · 3 personas"', () => {
    expect(textoExtra({ id: 'x', fecha: '2026-09-23', comida: 'cena', cantidad: 3, nota: null })).toBe(
      'Miércoles 23/9 · Cena · 3 personas',
    )
    expect(textoExtra({ id: 'x', fecha: '2026-09-23', comida: 'desayuno', cantidad: 1, nota: 'x' })).toBe(
      'Miércoles 23/9 · Desayuno · 1 persona',
    )
  })
})

describe('notasPorComida: las notas de los extras para la celda de la cocina, sin nombres', () => {
  it('agrupa por día y comida, con la cantidad de cada extra; los extras sin nota no suman líneas', () => {
    expect(
      notasPorComida([
        { id: 'a', fecha: '2026-09-23', comida: 'cena', cantidad: 2, nota: 'Sin sal' },
        { id: 'b', fecha: '2026-09-23', comida: 'cena', cantidad: 1, nota: 'Vegetariano' },
        { id: 'c', fecha: '2026-09-23', comida: 'cena', cantidad: 4, nota: null },
        { id: 'd', fecha: '2026-09-24', comida: 'almuerzo', cantidad: 1, nota: 'Llega a las 13:30' },
      ]),
    ).toEqual({
      '2026-09-23': { cena: ['2 extra: Sin sal', '1 extra: Vegetariano'] },
      '2026-09-24': { almuerzo: ['1 extra: Llega a las 13:30'] },
    })
  })

  it('sin extras, vacío', () => {
    expect(notasPorComida([])).toEqual({})
  })
})
