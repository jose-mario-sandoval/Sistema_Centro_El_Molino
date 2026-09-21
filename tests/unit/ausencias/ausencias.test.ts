import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { DIAS_MAXIMOS_AUSENCIA, estaAusente } from '@/lib/ausencias/tipos'
import { camposConError } from '@/lib/validacion/auth'
import { esquemaAusencia, esquemaQuitarAusencia } from '@/lib/validacion/ausencias'

const camposInvalidos = (esquema: z.ZodType, entrada: unknown) => {
  const r = esquema.safeParse(entrada)
  return r.success ? [] : Object.keys(camposConError(r.error))
}

describe('estaAusente', () => {
  const rangos = [
    { desde: '2026-09-17', hasta: '2026-09-19' },
    { desde: '2026-09-25', hasta: '2026-09-25' },
  ]

  it('cuenta el primero y el último día del rango', () => {
    expect(estaAusente(rangos, '2026-09-17')).toBe(true)
    expect(estaAusente(rangos, '2026-09-18')).toBe(true)
    expect(estaAusente(rangos, '2026-09-19')).toBe(true)
  })

  it('un solo día también cuenta', () => {
    expect(estaAusente(rangos, '2026-09-25')).toBe(true)
  })

  it('los días de afuera no', () => {
    expect(estaAusente(rangos, '2026-09-16')).toBe(false)
    expect(estaAusente(rangos, '2026-09-20')).toBe(false)
    expect(estaAusente(rangos, '2026-09-26')).toBe(false)
  })

  it('sin rangos, nunca', () => {
    expect(estaAusente([], '2026-09-17')).toBe(false)
  })

  it('cruza el fin de mes y de año sin problemas: las fechas ISO se comparan como texto', () => {
    expect(estaAusente([{ desde: '2026-12-30', hasta: '2027-01-02' }], '2027-01-01')).toBe(true)
    expect(estaAusente([{ desde: '2026-12-30', hasta: '2027-01-02' }], '2027-01-03')).toBe(false)
  })
})

describe('esquemaAusencia', () => {
  it('acepta un rango y un solo día', () => {
    expect(esquemaAusencia.safeParse({ desde: '2026-09-17', hasta: '2026-09-19' }).success).toBe(true)
    expect(esquemaAusencia.safeParse({ desde: '2026-09-17', hasta: '2026-09-17' }).success).toBe(true)
  })

  it('el último día no puede ser anterior al primero', () => {
    expect(camposInvalidos(esquemaAusencia, { desde: '2026-09-19', hasta: '2026-09-17' })).toEqual(['hasta'])
  })

  it(`dura como mucho ${DIAS_MAXIMOS_AUSENCIA} días, igual que la base de datos`, () => {
    expect(esquemaAusencia.safeParse({ desde: '2026-01-01', hasta: '2027-01-01' }).success).toBe(true)
    expect(camposInvalidos(esquemaAusencia, { desde: '2026-01-01', hasta: '2027-01-02' })).toEqual(['hasta'])
  })

  it.each([
    [{ desde: '', hasta: '2026-09-17' }, 'desde'],
    [{ desde: '2026-09-17', hasta: '' }, 'hasta'],
    [{ desde: '17/09/2026', hasta: '2026-09-17' }, 'desde'],
    [{ desde: '1999-12-31', hasta: '2026-09-17' }, 'desde'],
  ])('rechaza %j', (entrada, campo) => {
    expect(camposInvalidos(esquemaAusencia, entrada)).toContain(campo)
  })

  it('un formulario sin campos no se acepta', () => {
    expect(esquemaAusencia.safeParse({ desde: null, hasta: null }).success).toBe(false)
  })
})

describe('esquemaQuitarAusencia', () => {
  it('pide un id válido', () => {
    expect(esquemaQuitarAusencia.safeParse({ id: '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c' }).success).toBe(true)
    expect(esquemaQuitarAusencia.safeParse({ id: 'no-es-un-uuid' }).success).toBe(false)
  })
})
