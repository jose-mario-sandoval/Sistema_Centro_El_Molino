import { describe, expect, it } from 'vitest'
import { mensajeNota, normalizarNota, notaInicial, notaValida } from '@/lib/comidas/notas'

describe('normalizarNota', () => {
  it('recorta espacios y segundos en las notas de hora', () => {
    expect(normalizarNota('tarde', ' 13:30 ')).toBe('13:30')
    expect(normalizarNota('temprano', '06:45:00')).toBe('06:45')
  })

  it('recorta el texto de enfermo', () => {
    expect(normalizarNota('enfermo', '  Solo sopa  ')).toBe('Solo sopa')
  })

  it('vacío, solo espacios, null o undefined quedan como null', () => {
    expect(normalizarNota('tarde', '')).toBeNull()
    expect(normalizarNota('enfermo', '   ')).toBeNull()
    expect(normalizarNota('tarde', null)).toBeNull()
    expect(normalizarNota('enfermo', undefined)).toBeNull()
  })

  it('descarta la nota de los estados que no la llevan', () => {
    expect(normalizarNota('si', '13:30')).toBeNull()
    expect(normalizarNota('no', 'algo')).toBeNull()
    expect(normalizarNota('bolsa', 'algo')).toBeNull()
  })

  it('deja sin tocar una hora con otro formato (la valida notaValida)', () => {
    expect(normalizarNota('tarde', '7:30')).toBe('7:30')
  })
})

describe('notaValida', () => {
  it.each([
    ['si', null],
    ['no', null],
    ['bolsa', null],
    ['temprano', '06:05'],
    ['tarde', '13:30'],
    ['tarde', '00:00'],
    ['tarde', '23:59'],
    ['enfermo', 'Sopa'],
    ['enfermo', 'x'.repeat(200)],
  ] as const)('acepta %s con nota %j', (estado, nota) => {
    expect(notaValida(estado, nota)).toBe(true)
  })

  it.each([
    ['si', 'algo'],
    ['bolsa', ''],
    ['tarde', null],
    ['tarde', '24:00'],
    ['tarde', '7:30'],
    ['temprano', '12:60'],
    ['temprano', '13:30:00'],
    ['enfermo', null],
    ['enfermo', ''],
    ['enfermo', 'x'.repeat(201)],
  ] as const)('rechaza %s con nota %j', (estado, nota) => {
    expect(notaValida(estado, nota)).toBe(false)
  })
})

describe('mensajeNota', () => {
  it('explica qué falta según el tipo de nota', () => {
    expect(mensajeNota('tarde')).toBe('Indicá la hora para "Comer tarde" (HH:MM).')
    expect(mensajeNota('temprano')).toBe('Indicá la hora para "Comer temprano" (HH:MM).')
    expect(mensajeNota('enfermo')).toBe('Indicá qué podés comer (hasta 200 caracteres).')
    expect(mensajeNota('si')).toBe('"Sí comer" no lleva nota.')
  })
})

describe('notaInicial', () => {
  it('el mismo estado vuelve a mostrar su nota', () => {
    expect(notaInicial({ estado: 'temprano', nota: '06:45' }, 'temprano')).toBe('06:45')
    expect(notaInicial({ estado: 'enfermo', nota: 'Sopa' }, 'enfermo')).toBe('Sopa')
  })

  it('entre temprano y tarde se conserva la hora (hay que confirmarla igual)', () => {
    expect(notaInicial({ estado: 'tarde', nota: '20:00' }, 'temprano')).toBe('20:00')
    expect(notaInicial({ estado: 'temprano', nota: '06:45' }, 'tarde')).toBe('06:45')
  })

  it('entre tipos de nota distintos, o sin nota, empieza vacía', () => {
    expect(notaInicial({ estado: 'enfermo', nota: 'Sopa' }, 'tarde')).toBe('')
    expect(notaInicial({ estado: 'tarde', nota: '20:00' }, 'enfermo')).toBe('')
    expect(notaInicial({ estado: 'si', nota: null }, 'tarde')).toBe('')
    expect(notaInicial(null, 'temprano')).toBe('')
  })
})
