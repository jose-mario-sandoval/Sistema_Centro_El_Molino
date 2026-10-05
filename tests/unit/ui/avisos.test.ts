import { describe, expect, it } from 'vitest'
import { duracionAviso } from '@/components/ui/avisos'

describe('duracionAviso', () => {
  it('un aviso corto dura lo de siempre', () => {
    expect(duracionAviso('Evento agregado.')).toBe(2600)
  })

  it('uno largo dura lo que hace falta para leerlo con calma (la explicación de por qué no se ve un evento)', () => {
    const largo = 'Evento agregado. No se ve en el calendario porque «San Miguel» está oculto en los filtros.'
    expect(duracionAviso(largo)).toBeGreaterThanOrEqual(6000)
  })

  it('nunca se queda para siempre', () => {
    expect(duracionAviso('x'.repeat(1000))).toBe(10_000)
  })
})
