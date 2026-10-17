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

  it('recorta la nota opcional de bolsa y lonchera, y la deja en null si queda vacía', () => {
    expect(normalizarNota('bolsa', '  Sin sal  ')).toBe('Sin sal')
    expect(normalizarNota('lonchera', 'Sin picante')).toBe('Sin picante')
    expect(normalizarNota('bolsa', '   ')).toBeNull()
    expect(normalizarNota('lonchera', null)).toBeNull()
  })

  it('descarta la nota de los estados que no la llevan', () => {
    expect(normalizarNota('si', '13:30')).toBeNull()
    expect(normalizarNota('no', 'algo')).toBeNull()
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
    ['lonchera', null],
    ['bolsa', 'Sin sal'],
    ['lonchera', 'Sin sal'],
    ['lonchera', 'x'.repeat(200)],
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
    ['lonchera', ''],
    ['bolsa', 'x'.repeat(201)],
    ['lonchera', 'x'.repeat(201)],
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

  it('la nota opcional solo se queja del largo', () => {
    expect(mensajeNota('bolsa')).toBe('La nota puede tener hasta 200 caracteres.')
    expect(mensajeNota('lonchera', 'ajena')).toBe('La nota puede tener hasta 200 caracteres.')
  })

  it('en tercera persona (el Director cambia la comida de otra persona)', () => {
    expect(mensajeNota('enfermo', 'ajena')).toBe('Indicá qué puede comer (hasta 200 caracteres).')
    expect(mensajeNota('tarde', 'ajena')).toBe('Indicá la hora para "Comer tarde" (HH:MM).')
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

  describe('con nota opcional (bolsa, lonchera)', () => {
    it('vacía se guarda igual, con nota null: "Listo" y "Guardar" cierran sin error', () => {
      for (const alCerrar of [true, false]) {
        expect(resolverBorrador({ estado: 'bolsa', nota: '' }, { estado: 'si', nota: null }, { alCerrar })).toEqual({
          tipo: 'guardar',
          valor: { estado: 'bolsa', nota: null },
        })
        expect(resolverBorrador({ estado: 'lonchera', nota: '   ' }, null, { alCerrar })).toEqual({
          tipo: 'guardar',
          valor: { estado: 'lonchera', nota: null },
        })
      }
    })

    it('escrita se guarda recortada', () => {
      expect(resolverBorrador({ estado: 'lonchera', nota: ' Sin sal ' }, null, { alCerrar: true })).toEqual({
        tipo: 'guardar',
        valor: { estado: 'lonchera', nota: 'Sin sal' },
      })
    })

    it('igual a lo guardado no hay nada que guardar; vaciar una nota guardada sí', () => {
      expect(resolverBorrador({ estado: 'bolsa', nota: '' }, { estado: 'bolsa', nota: null }, { alCerrar: true })).toEqual({
        tipo: 'nada',
      })
      expect(resolverBorrador({ estado: 'bolsa', nota: 'Sin sal' }, { estado: 'bolsa', nota: 'Sin sal' }, { alCerrar: true })).toEqual({
        tipo: 'nada',
      })
      expect(resolverBorrador({ estado: 'bolsa', nota: '' }, { estado: 'bolsa', nota: 'Sin sal' }, { alCerrar: true })).toEqual({
        tipo: 'guardar',
        valor: { estado: 'bolsa', nota: null },
      })
    })

    it('demasiado larga: error y la burbuja no se cierra', () => {
      expect(resolverBorrador({ estado: 'bolsa', nota: 'x'.repeat(201) }, null, { alCerrar: true })).toEqual({
        tipo: 'error',
        mensaje: 'La nota puede tener hasta 200 caracteres. Si no querés cambiarla, tocá "Cancelar".',
      })
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

  it('entre bolsa y lonchera se conserva la nota', () => {
    expect(notaInicial({ estado: 'bolsa', nota: 'Sin sal' }, 'lonchera')).toBe('Sin sal')
    expect(notaInicial({ estado: 'lonchera', nota: 'Sin sal' }, 'bolsa')).toBe('Sin sal')
  })

  it('entre tipos de nota distintos, o sin nota, empieza vacía', () => {
    expect(notaInicial({ estado: 'enfermo', nota: 'Sopa' }, 'tarde')).toBe('')
    expect(notaInicial({ estado: 'tarde', nota: '20:00' }, 'enfermo')).toBe('')
    // Lo que puede comer quien está enfermo no se arrastra a la bolsa, ni al revés.
    expect(notaInicial({ estado: 'enfermo', nota: 'Sopa' }, 'bolsa')).toBe('')
    expect(notaInicial({ estado: 'bolsa', nota: 'Sin sal' }, 'enfermo')).toBe('')
    expect(notaInicial({ estado: 'tarde', nota: '20:00' }, 'bolsa')).toBe('')
    expect(notaInicial({ estado: 'si', nota: null }, 'tarde')).toBe('')
    expect(notaInicial(null, 'temprano')).toBe('')
  })
})

describe('resolverBorrador: el mensaje sigue la voz', () => {
  it('enfermo sin nota, en tercera persona', () => {
    expect(resolverBorrador({ estado: 'enfermo', nota: '' }, null, { alCerrar: false, voz: 'ajena' })).toEqual({
      tipo: 'error',
      mensaje: 'Indicá qué puede comer (hasta 200 caracteres).',
    })
  })
})
