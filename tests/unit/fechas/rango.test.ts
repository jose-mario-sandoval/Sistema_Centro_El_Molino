import { describe, expect, it } from 'vitest'
import { rangoLegible } from '@/lib/fechas/rango'

describe('rangoLegible', () => {
  it('un solo día', () => {
    expect(rangoLegible('2026-09-21', '2026-09-21')).toBe('21 de septiembre')
  })

  it('varios días del mismo mes', () => {
    expect(rangoLegible('2026-09-21', '2026-09-25')).toBe('21 al 25 de septiembre')
  })

  it('cruza de mes', () => {
    expect(rangoLegible('2026-09-28', '2026-10-04')).toBe('28 de septiembre al 4 de octubre')
  })

  it('cruza de año', () => {
    expect(rangoLegible('2026-12-28', '2027-01-03')).toBe('28 de diciembre al 3 de enero')
  })
})
