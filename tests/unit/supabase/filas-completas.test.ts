import { describe, expect, it } from 'vitest'
import { exigirFilasCompletas } from '@/lib/supabase/filas-completas'

describe('exigirFilasCompletas', () => {
  it('sin conteo (no se pidió count) no puede comprobar nada y no lanza', () => {
    expect(() => exigirFilasCompletas({ data: [1, 2], count: null }, 'Selecciones')).not.toThrow()
  })

  it('si llegaron todas las filas, no lanza', () => {
    expect(() => exigirFilasCompletas({ data: [1, 2, 3], count: 3 }, 'Selecciones')).not.toThrow()
    expect(() => exigirFilasCompletas({ data: [], count: 0 }, 'Selecciones')).not.toThrow()
  })

  it('si PostgREST cortó en max_rows, lanza diciendo cuántas llegaron', () => {
    expect(() => exigirFilasCompletas({ data: [1, 2], count: 1500 }, 'Selecciones de la semana')).toThrow(
      'Selecciones de la semana: llegaron 2 de 1500 filas (PostgREST cortó en max_rows).',
    )
  })
})
