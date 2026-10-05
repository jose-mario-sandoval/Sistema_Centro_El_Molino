import { describe, expect, it } from 'vitest'
import { ORDEN_COCINA, partesParaCocina, resumenComida, textoParte, textoResumen, totalQueComen } from '@/lib/comidas/resumen'
import { ESTADOS_COMIDA, type EstadoComida, type ValorEfectivo } from '@/lib/comidas/tipos'

function v(estado: EstadoComida, nota: string | null = null, origen: 'plan' | 'persona' = 'plan'): ValorEfectivo {
  return { estado, nota, origen }
}

describe('resumenComida', () => {
  it('sin personas no tiene partes', () => {
    const resumen = resumenComida([])
    expect(resumen).toEqual({ total: 0, partes: [] })
    expect(textoResumen(resumen)).toBe('Sin personas')
  })

  it('cuenta por estado en orden fijo y deja "sin definir" al final', () => {
    const resumen = resumenComida([v('no'), null, v('si'), v('tarde', '13:30'), v('si')])
    expect(resumen).toEqual({
      total: 5,
      partes: [
        { clave: 'si', cantidad: 2, texto: '2 sí' },
        { clave: 'no', cantidad: 1, texto: '1 no come' },
        { clave: 'tarde', cantidad: 1, texto: '1 tarde (13:30)' },
        { clave: 'sin_definir', cantidad: 1, texto: '1 sin definir' },
      ],
    })
  })

  it('agrupa y ordena las horas de temprano y tarde', () => {
    const resumen = resumenComida([v('tarde', '14:00'), v('tarde', '13:30'), v('temprano', '06:30'), v('tarde', '13:30')])
    expect(resumen.partes.map((p) => p.texto)).toEqual(['1 temprano (06:30)', '3 tarde (13:30 ×2, 14:00)'])
  })

  it('cuenta igual lo que viene del plan y lo que cambió la persona', () => {
    const resumen = resumenComida([v('si', null, 'plan'), v('si', null, 'persona')])
    expect(resumen.partes).toEqual([{ clave: 'si', cantidad: 2, texto: '2 sí' }])
  })

  it('nombra "en bolsa" y deja aparte, en `notas`, lo que puede comer quien está enfermo', () => {
    const resumen = resumenComida([v('enfermo', 'Solo sopa'), v('bolsa')])
    expect(resumen.partes).toEqual([
      { clave: 'bolsa', cantidad: 1, texto: '1 en bolsa' },
      { clave: 'enfermo', cantidad: 1, texto: '1 enfermo', notas: ['Solo sopa'] },
    ])
  })

  it('varios enfermos: plural, una nota por persona, en su orden y sin agrupar', () => {
    const resumen = resumenComida([v('enfermo', 'Sopa'), v('si'), v('enfermo', 'Dieta blanda'), v('enfermo', 'Sopa')])
    expect(resumen.partes.find((p) => p.clave === 'enfermo')).toEqual({
      clave: 'enfermo',
      cantidad: 3,
      texto: '3 enfermos',
      notas: ['Sopa', 'Dieta blanda', 'Sopa'],
    })
  })

  it('un enfermo sin nota no agrega `notas` (ni una lista vacía)', () => {
    const [parte] = resumenComida([v('enfermo'), v('enfermo', '   ')]).partes
    expect(parte).toEqual({ clave: 'enfermo', cantidad: 2, texto: '2 enfermos' })
    expect(parte).not.toHaveProperty('notas')
  })

  it('las horas no son notas: siguen en el texto', () => {
    expect(resumenComida([v('tarde', '13:30')]).partes[0]).not.toHaveProperty('notas')
  })

  it('una hora sin nota no agrega paréntesis', () => {
    expect(resumenComida([v('tarde')]).partes[0].texto).toBe('1 tarde')
  })

  it('"no" dice que no comen, en singular o plural', () => {
    expect(resumenComida([v('no')]).partes[0].texto).toBe('1 no come')
    expect(resumenComida([v('no'), v('no')]).partes[0].texto).toBe('2 no comen')
  })
})

describe('partesParaCocina', () => {
  it('ordena primero lo que cambia la preparación y deja "sin definir" al final', () => {
    const resumen = resumenComida([
      null,
      v('no'),
      v('si'),
      v('enfermo', 'Solo sopa'),
      v('bolsa'),
      v('tarde', '13:30'),
      v('temprano', '06:30'),
      v('si'),
    ])
    expect(partesParaCocina(resumen).map((p) => p.clave)).toEqual([
      'temprano',
      'tarde',
      'bolsa',
      'enfermo',
      'si',
      'no',
      'sin_definir',
    ])
  })

  it('solo incluye las partes que tienen personas', () => {
    const resumen = resumenComida([v('si'), v('bolsa'), v('si')])
    expect(partesParaCocina(resumen)).toEqual([
      { clave: 'bolsa', cantidad: 1, texto: '1 en bolsa' },
      { clave: 'si', cantidad: 2, texto: '2 sí' },
    ])
  })

  it('sin personas, ninguna parte', () => {
    expect(partesParaCocina(resumenComida([]))).toEqual([])
  })

  it('el orden de la cocina incluye todos los estados y "sin definir": ninguno se cae del desglose', () => {
    // totalQueComen cuenta todo estado que no sea "no": si uno faltara acá, sumaría sin verse.
    expect(new Set(ORDEN_COCINA)).toEqual(new Set([...ESTADOS_COMIDA, 'sin_definir']))
    expect(ORDEN_COCINA).toHaveLength(ESTADOS_COMIDA.length + 1)
  })

  it('no reordena el resumen original', () => {
    const resumen = resumenComida([v('si'), v('temprano', '06:30')])
    partesParaCocina(resumen)
    expect(resumen.partes.map((p) => p.clave)).toEqual(['si', 'temprano'])
  })
})

describe('textoParte', () => {
  it('sin notas, el texto corto', () => {
    expect(textoParte({ clave: 'si', cantidad: 2, texto: '2 sí' })).toBe('2 sí')
  })

  it('con notas, entre paréntesis y separadas por punto y coma', () => {
    const [parte] = resumenComida([v('enfermo', 'Sopa de pollo'), v('enfermo', 'Dieta blanda')]).partes
    expect(textoParte(parte)).toBe('2 enfermos (Sopa de pollo; Dieta blanda)')
  })
})

describe('textoResumen', () => {
  it('une las partes con un punto medio', () => {
    expect(textoResumen(resumenComida([v('si'), v('tarde', '13:30'), null]))).toBe('1 sí · 1 tarde (13:30) · 1 sin definir')
  })

  it('lleva las notas de enfermo', () => {
    expect(textoResumen(resumenComida([v('si'), v('enfermo', 'Sopa')]))).toBe('1 sí · 1 enfermo (Sopa)')
  })
})

describe('totalQueComen', () => {
  it('cuenta todo salvo "no" y "sin definir"', () => {
    const resumen = resumenComida([v('si'), v('si'), v('no'), null, v('tarde', '13:30')])
    expect(totalQueComen(resumen)).toBe(3)
  })

  it('sin personas, 0', () => {
    expect(totalQueComen(resumenComida([]))).toBe(0)
  })

  it('todos "no", 0', () => {
    expect(totalQueComen(resumenComida([v('no'), v('no')]))).toBe(0)
  })
})
