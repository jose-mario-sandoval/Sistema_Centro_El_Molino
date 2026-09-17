import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { camposConError } from '@/lib/validacion/auth'
import { esquemaPlan, esquemaSeleccion, esquemaVolverAPlan } from '@/lib/validacion/comidas'

function camposInvalidos(esquema: z.ZodType, entrada: unknown): string[] {
  const resultado = esquema.safeParse(entrada)
  return resultado.success ? [] : Object.keys(camposConError(resultado.error))
}

const SELECCION = { fecha: '2026-09-23', comida: 'almuerzo', estado: 'tarde', nota: '13:30' }
const PLAN = { diaSemana: 3, comida: 'cena', estado: 'temprano', nota: '19:00' }

describe('esquemaSeleccion', () => {
  it('acepta y normaliza la nota', () => {
    expect(esquemaSeleccion.parse({ ...SELECCION, nota: ' 13:30:00 ' })).toEqual(SELECCION)
  })

  it('descarta la nota de los estados que no la llevan y acepta nota ausente', () => {
    expect(esquemaSeleccion.parse({ ...SELECCION, estado: 'si', nota: 'x' })).toEqual({ ...SELECCION, estado: 'si', nota: null })
    expect(esquemaSeleccion.parse({ fecha: '2026-09-23', comida: 'cena', estado: 'no' })).toEqual({
      fecha: '2026-09-23',
      comida: 'cena',
      estado: 'no',
      nota: null,
    })
  })

  it.each([
    ['fecha inexistente', { fecha: '2026-02-30' }, 'fecha'],
    ['comida desconocida', { comida: 'merienda' }, 'comida'],
    ['estado desconocido', { estado: 'quizas' }, 'estado'],
    ['tarde sin hora', { nota: null }, 'nota'],
    ['tarde con hora inválida', { nota: '25:00' }, 'nota'],
    ['enfermo con 201 caracteres', { estado: 'enfermo', nota: 'x'.repeat(201) }, 'nota'],
    ['nota que no es texto', { nota: 1330 }, 'nota'],
  ])('rechaza %s', (_caso, cambio, campo) => {
    expect(camposInvalidos(esquemaSeleccion, { ...SELECCION, ...cambio })).toEqual([campo])
  })
})

describe('esquemaPlan', () => {
  it('acepta un día con estado y nota', () => {
    expect(esquemaPlan.parse(PLAN)).toEqual(PLAN)
  })

  it('estado null (Sin definir) descarta la nota', () => {
    expect(esquemaPlan.parse({ ...PLAN, estado: null, nota: '10:00' })).toEqual({ ...PLAN, estado: null, nota: null })
  })

  it.each([
    ['día 0', { diaSemana: 0 }, 'diaSemana'],
    ['día 8', { diaSemana: 8 }, 'diaSemana'],
    ['día con decimales', { diaSemana: 2.5 }, 'diaSemana'],
    ['día como texto', { diaSemana: '3' }, 'diaSemana'],
    ['temprano sin hora', { nota: '' }, 'nota'],
  ])('rechaza %s', (_caso, cambio, campo) => {
    expect(camposInvalidos(esquemaPlan, { ...PLAN, ...cambio })).toEqual([campo])
  })
})

describe('esquemaVolverAPlan', () => {
  it('acepta fecha y comida', () => {
    expect(esquemaVolverAPlan.parse({ fecha: '2026-09-23', comida: 'almuerzo' })).toEqual({ fecha: '2026-09-23', comida: 'almuerzo' })
  })

  it('rechaza una fecha inválida', () => {
    expect(camposInvalidos(esquemaVolverAPlan, { fecha: '23/09/2026', comida: 'almuerzo' })).toEqual(['fecha'])
  })
})
