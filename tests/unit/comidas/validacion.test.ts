import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { camposConError } from '@/lib/validacion/auth'
import { esquemaExtra, esquemaPlan, esquemaQuitarExtra, esquemaSeleccion, esquemaVolverAPlan } from '@/lib/validacion/comidas'

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

describe('usuarioId: de quién son las comidas (opcional, lo usa el Director)', () => {
  const ID = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f'
  const casos = [
    ['esquemaSeleccion', esquemaSeleccion, SELECCION],
    ['esquemaPlan', esquemaPlan, PLAN],
    ['esquemaVolverAPlan', esquemaVolverAPlan, { fecha: '2026-09-23', comida: 'almuerzo' }],
  ] as const

  it.each(casos)('%s lo acepta y lo deja pasar; sin él, no aparece', (_nombre, esquema, base) => {
    expect(esquema.parse({ ...base, usuarioId: ID })).toMatchObject({ usuarioId: ID })
    expect(esquema.parse(base)).not.toHaveProperty('usuarioId')
  })

  it.each(casos)('%s rechaza un usuarioId que no es un uuid', (_nombre, esquema, base) => {
    expect(camposInvalidos(esquema, { ...base, usuarioId: 'otra-persona' })).toEqual(['usuarioId'])
  })
})

describe('esquemaExtra: un extra manual para la cocina', () => {
  const EXTRA = { fecha: '2026-09-30', comida: 'cena', cantidad: 3, nota: 'Sin sal' }

  it('acepta día, comida, cantidad y nota', () => {
    expect(esquemaExtra.parse(EXTRA)).toEqual(EXTRA)
  })

  it('la cantidad puede llegar como texto (formulario)', () => {
    expect(esquemaExtra.parse({ ...EXTRA, cantidad: '12' })).toMatchObject({ cantidad: 12 })
  })

  it.each([[undefined], [null], [''], ['   ']])('nota %j = sin nota', (nota) => {
    expect(esquemaExtra.parse({ ...EXTRA, nota })).toEqual({ ...EXTRA, nota: null })
  })

  it('recorta la nota', () => {
    expect(esquemaExtra.parse({ ...EXTRA, nota: '  Sin sal  ' })).toEqual(EXTRA)
  })

  it.each([
    ['fecha inexistente', { fecha: '2026-02-30' }, 'fecha'],
    ['fecha fuera de rango', { fecha: '1999-12-31' }, 'fecha'],
    ['comida desconocida', { comida: 'merienda' }, 'comida'],
    ['cantidad 0', { cantidad: 0 }, 'cantidad'],
    ['cantidad 51', { cantidad: 51 }, 'cantidad'],
    ['cantidad con decimales', { cantidad: 2.5 }, 'cantidad'],
    ['cantidad que no es número', { cantidad: 'tres' }, 'cantidad'],
    ['cantidad vacía', { cantidad: '' }, 'cantidad'],
    ['nota de 201 caracteres', { nota: 'x'.repeat(201) }, 'nota'],
  ])('rechaza %s', (_caso, cambio, campo) => {
    expect(camposInvalidos(esquemaExtra, { ...EXTRA, ...cambio })).toEqual([campo])
  })

  it('sin cantidad no se acepta', () => {
    expect(camposInvalidos(esquemaExtra, { fecha: EXTRA.fecha, comida: EXTRA.comida })).toEqual(['cantidad'])
  })
})

describe('esquemaQuitarExtra', () => {
  it('pide un id válido', () => {
    expect(esquemaQuitarExtra.safeParse({ id: '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c' }).success).toBe(true)
    expect(esquemaQuitarExtra.safeParse({ id: 'no-es-un-uuid' }).success).toBe(false)
  })
})
