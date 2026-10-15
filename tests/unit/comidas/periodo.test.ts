import { describe, expect, it } from 'vitest'
import { periodoEditable } from '@/lib/comidas/periodo'

describe('periodoEditable', () => {
  it.each([
    ['2026-09-16', '2026-12-16'],
    ['2026-10-31', '2027-01-31'],
    ['2026-12-31', '2027-03-31'],
    ['2026-01-31', '2026-04-30'],
    ['2026-08-31', '2026-11-30'],
    ['2026-11-30', '2027-02-28'],
    ['2027-11-30', '2028-02-29'],
    ['2028-02-29', '2028-05-29'],
  ])('desde %s incluye hoy y termina a los tres meses calendario en %s', (hoy, hasta) => {
    expect(periodoEditable(hoy)).toEqual({ desde: hoy, hasta })
  })

  it('avanza con la fecha actual, incluso al salir de un mes que ajusta el día final', () => {
    expect(periodoEditable('2026-11-30')).toEqual({ desde: '2026-11-30', hasta: '2027-02-28' })
    expect(periodoEditable('2026-12-01')).toEqual({ desde: '2026-12-01', hasta: '2027-03-01' })
  })
})
