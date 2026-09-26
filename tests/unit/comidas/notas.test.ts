import { describe, expect, it } from 'vitest'
import { mensajeNota, normalizarNota, notaInicial, notaValida, resolverBorrador } from '@/lib/comidas/notas'

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

describe('resolverBorrador', () => {
  it('hora escrita y "Listo" sin "Guardar": se guarda igual que con "Guardar"', () => {
    const borrador = { estado: 'tarde', nota: '12:00' } as const
    const esperado = { tipo: 'guardar', valor: { estado: 'tarde', nota: '12:00' } }
    expect(resolverBorrador(borrador, { estado: 'si', nota: null }, { alCerrar: true })).toEqual(esperado)
    expect(resolverBorrador(borrador, { estado: 'si', nota: null }, { alCerrar: false })).toEqual(esperado)
  })

  it('nota vacía o inválida y "Listo": el panel queda abierto con el error y cómo salir sin cambiarla', () => {
    expect(resolverBorrador({ estado: 'tarde', nota: '' }, null, { alCerrar: true })).toEqual({
      tipo: 'error',
      mensaje: 'Indicá la hora para "Comer tarde" (HH:MM). Si no querés cambiarla, tocá "Cancelar".',
    })
    expect(resolverBorrador({ estado: 'enfermo', nota: '   ' }, null, { alCerrar: true })).toMatchObject({ tipo: 'error' })
    expect(resolverBorrador({ estado: 'temprano', nota: '25:00' }, null, { alCerrar: true })).toMatchObject({ tipo: 'error' })
  })

  it('con "Guardar", el error no repite lo de "Cancelar"', () => {
    expect(resolverBorrador({ estado: 'temprano', nota: '' }, null, { alCerrar: false })).toEqual({
      tipo: 'error',
      mensaje: 'Indicá la hora para "Comer temprano" (HH:MM).',
    })
  })

  it('sin borrador, o igual a lo guardado, no hay nada que guardar', () => {
    expect(resolverBorrador(null, { estado: 'tarde', nota: '12:00' }, { alCerrar: true })).toEqual({ tipo: 'nada' })
    expect(resolverBorrador({ estado: 'tarde', nota: '12:00:00' }, { estado: 'tarde', nota: '12:00' }, { alCerrar: true })).toEqual({
      tipo: 'nada',
    })
  })

  it('guarda la nota normalizada', () => {
    expect(resolverBorrador({ estado: 'enfermo', nota: '  Sopa  ' }, null, { alCerrar: true })).toEqual({
      tipo: 'guardar',
      valor: { estado: 'enfermo', nota: 'Sopa' },
    })
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
