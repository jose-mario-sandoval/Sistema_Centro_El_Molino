import { describe, expect, it } from 'vitest'
import { aparienciaDeCuenta, COLUMNA_DE, conciliar } from '@/lib/apariencia'
import { esquemaApariencia } from '@/lib/validacion/apariencia'

describe('aparienciaDeCuenta', () => {
  it('lee lo que la cuenta tiene guardado', () => {
    expect(
      aparienciaDeCuenta({ apariencia_tema: 'oscuro', apariencia_contraste: 'alto', apariencia_texto: 'enorme' }),
    ).toEqual({ tema: 'oscuro', contraste: 'alto', texto: 'enorme' })
  })

  it('nulo significa que la persona nunca eligió', () => {
    expect(aparienciaDeCuenta({ apariencia_tema: null, apariencia_contraste: 'suave', apariencia_texto: null })).toEqual({
      contraste: 'suave',
    })
  })

  it('tolera columnas ausentes: la migración puede llegar después que el código', () => {
    expect(aparienciaDeCuenta({})).toEqual({})
  })

  it('descarta valores que no existen', () => {
    expect(aparienciaDeCuenta({ apariencia_tema: 'morado', apariencia_texto: 'gigante' })).toEqual({})
  })
})

describe('conciliar', () => {
  it('la cuenta manda sobre el dispositivo', () => {
    expect(conciliar({ texto: 'normal' }, { texto: 'grande' })).toEqual({ aplicar: { texto: 'grande' }, subir: {} })
  })

  it('si ya coinciden no hay nada que hacer', () => {
    expect(conciliar({ texto: 'grande', tema: 'oscuro' }, { texto: 'grande', tema: 'oscuro' })).toEqual({
      aplicar: {},
      subir: {},
    })
  })

  it('lo que solo existe en el dispositivo sube a la cuenta, para no perderlo', () => {
    expect(conciliar({ texto: 'enorme', contraste: 'alto' }, {})).toEqual({
      aplicar: {},
      subir: { texto: 'enorme', contraste: 'alto' },
    })
  })

  it('cada ajuste se decide por separado', () => {
    expect(conciliar({ texto: 'normal', contraste: 'alto' }, { texto: 'grande', tema: 'claro' })).toEqual({
      aplicar: { texto: 'grande', tema: 'claro' },
      subir: { contraste: 'alto' },
    })
  })

  it('sin nada en ninguno lado no hace nada', () => {
    expect(conciliar({}, {})).toEqual({ aplicar: {}, subir: {} })
  })
})

describe('COLUMNA_DE', () => {
  it('cada ajuste tiene su columna', () => {
    expect(COLUMNA_DE).toEqual({
      tema: 'apariencia_tema',
      contraste: 'apariencia_contraste',
      texto: 'apariencia_texto',
    })
  })
})

describe('esquemaApariencia', () => {
  it('acepta uno o varios ajustes', () => {
    expect(esquemaApariencia.safeParse({ texto: 'grande' }).success).toBe(true)
    expect(esquemaApariencia.safeParse({ tema: 'auto', contraste: 'suave', texto: 'normal' }).success).toBe(true)
  })

  it.each([[{}], [{ texto: 'gigante' }], [{ tema: 'morado' }], [{ contraste: 3 }], ['texto'], [null]])(
    'rechaza %j',
    (entrada) => {
      expect(esquemaApariencia.safeParse(entrada).success).toBe(false)
    },
  )

  it('no deja pasar campos que no son de apariencia', () => {
    const r = esquemaApariencia.safeParse({ texto: 'grande', rol: 'director' })
    expect(r.success && 'rol' in r.data).toBe(false)
  })
})
