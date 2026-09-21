import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { camposConError } from '@/lib/validacion/auth'
import { esquemaEditarEvento, esquemaEliminarEvento, esquemaEvento, requerimientosValidos } from '@/lib/validacion/calendario'

const VALIDO = { titulo: 'Charla formativa', fecha: '2026-09-16', hora: '19:30', tipo: 'charla', requiere_cocina: [] }
const ID = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'

function camposInvalidos(esquema: z.ZodType, entrada: unknown): string[] {
  const resultado = esquema.safeParse(entrada)
  return resultado.success ? [] : Object.keys(camposConError(resultado.error))
}

describe('esquemaEvento', () => {
  it('acepta título, fecha y hora, y recorta el título', () => {
    expect(esquemaEvento.parse({ ...VALIDO, titulo: '  Charla formativa  ' })).toEqual(VALIDO)
  })

  it('una hora vacía queda como null', () => {
    expect(esquemaEvento.parse({ ...VALIDO, hora: '' })).toEqual({ ...VALIDO, hora: null })
  })

  it('acepta un título de exactamente 120 caracteres', () => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, titulo: 'x'.repeat(120) })).toEqual([])
  })

  it('acepta las fechas límite del rango', () => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, fecha: '2000-01-01' })).toEqual([])
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, fecha: '2099-12-31' })).toEqual([])
  })

  it.each(['1999-12-31', '2100-01-01', '0001-01-01', '9999-12-31'])('rechaza la fecha fuera de rango %s', (fecha) => {
    const resultado = esquemaEvento.safeParse({ ...VALIDO, fecha })
    expect(resultado.success).toBe(false)
    expect(camposConError(resultado.error!)).toEqual({ fecha: 'Fecha fuera de rango.' })
  })

  it('ignora campos desconocidos', () => {
    expect(esquemaEvento.parse({ ...VALIDO, id: ID, creado_por: ID })).toEqual(VALIDO)
  })

  it.each([
    ['título vacío tras recortar', { titulo: '   ' }, 'titulo'],
    ['título de 121 caracteres', { titulo: 'x'.repeat(121) }, 'titulo'],
    ['título ausente', { titulo: null }, 'titulo'],
    ['fecha inexistente', { fecha: '2026-02-30' }, 'fecha'],
    ['fecha con otro formato', { fecha: '16/09/2026' }, 'fecha'],
    ['hora 24:00', { hora: '24:00' }, 'hora'],
    ['hora sin cero inicial', { hora: '7:30' }, 'hora'],
    ['hora con segundos', { hora: '19:30:00' }, 'hora'],
  ])('rechaza %s', (_caso, cambio, campo) => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, ...cambio })).toEqual([campo])
  })
})

describe('esquemaEditarEvento', () => {
  it('acepta un id uuid junto con los campos', () => {
    expect(esquemaEditarEvento.parse({ ...VALIDO, hora: '', id: ID })).toEqual({ ...VALIDO, hora: null, id: ID })
  })

  it('rechaza un id que no es uuid', () => {
    expect(camposInvalidos(esquemaEditarEvento, { ...VALIDO, id: 'evento-1' })).toEqual(['id'])
  })
})

describe('esquemaEliminarEvento', () => {
  it('exige un id uuid', () => {
    expect(esquemaEliminarEvento.parse({ id: ID })).toEqual({ id: ID })
    expect(camposInvalidos(esquemaEliminarEvento, { id: 42 })).toEqual(['id'])
    expect(camposInvalidos(esquemaEliminarEvento, {})).toEqual(['id'])
  })
})

describe('esquemaEvento: tipo y pedidos a la cocina', () => {
  it.each(['retiro', 'charla', 'visita', 'reunion', 'otro'])('acepta el tipo %s', (tipo) => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, tipo })).toEqual([])
  })

  it.each([[undefined], [null], [''], ['fiesta']])('rechaza el tipo %j', (tipo) => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, tipo })).toEqual(['tipo'])
  })

  it.each([[[]], [['merienda']], [['comida']], [['materiales']], [['merienda', 'comida']]])(
    'acepta pedir %j a la cocina',
    (requiere_cocina) => {
      expect(esquemaEvento.parse({ ...VALIDO, requiere_cocina }).requiere_cocina).toEqual(requiere_cocina)
    },
  )

  it.each([
    [['materiales', 'merienda']],
    [['comida', 'materiales']],
    [['merienda', 'merienda']],
    [['desayuno']],
    ['merienda'],
    [null],
  ])('rechaza pedir %j a la cocina', (requiere_cocina) => {
    expect(camposInvalidos(esquemaEvento, { ...VALIDO, requiere_cocina })).toEqual(['requiere_cocina'])
  })

  it('exige el campo: un formulario sin casillas manda una lista vacía, no nada', () => {
    const { requiere_cocina: _omitido, ...sinCocina } = VALIDO
    void _omitido
    expect(camposInvalidos(esquemaEvento, sinCocina)).toEqual(['requiere_cocina'])
  })
})

describe('requerimientosValidos', () => {
  it('"solo materiales" no se combina y no hay repetidos', () => {
    expect(requerimientosValidos([])).toBe(true)
    expect(requerimientosValidos(['materiales'])).toBe(true)
    expect(requerimientosValidos(['merienda', 'comida'])).toBe(true)
    expect(requerimientosValidos(['materiales', 'comida'])).toBe(false)
    expect(requerimientosValidos(['comida', 'comida'])).toBe(false)
  })
})
