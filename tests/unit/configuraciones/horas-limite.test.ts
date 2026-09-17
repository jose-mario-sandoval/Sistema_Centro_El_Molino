import { describe, expect, it } from 'vitest'
import { describirCierre, horasLimiteDesdeFilas } from '@/lib/configuraciones/horas-limite'

describe('horasLimiteDesdeFilas', () => {
  it('convierte las filas de la base en HorasLimite sin segundos', () => {
    expect(
      horasLimiteDesdeFilas([
        { comida: 'cena', dia_relativo: 0, hora: '16:00:00' },
        { comida: 'desayuno', dia_relativo: -1, hora: '21:00:00' },
        { comida: 'almuerzo', dia_relativo: 0, hora: '10:30:00' },
      ]),
    ).toEqual({
      desayuno: { diaRelativo: -1, hora: '21:00' },
      almuerzo: { diaRelativo: 0, hora: '10:30' },
      cena: { diaRelativo: 0, hora: '16:00' },
    })
  })

  it('falla si falta una comida', () => {
    expect(() => horasLimiteDesdeFilas([{ comida: 'desayuno', dia_relativo: -1, hora: '21:00:00' }])).toThrow(
      'Falta la hora límite de almuerzo.',
    )
  })
})

describe('describirCierre', () => {
  it('describe el mismo día y el día anterior', () => {
    expect(describirCierre({ diaRelativo: 0, hora: '10:00' })).toBe('cierra el mismo día a las 10:00')
    expect(describirCierre({ diaRelativo: -1, hora: '21:00:00' })).toBe('cierra el día anterior a las 21:00')
  })
})
