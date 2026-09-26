import { describe, expect, it } from 'vitest'
import { celdasDesdePlan, claveCelda, conCelda, etiquetaCelda, hayQueGuardar, mensajeFalloCelda } from '@/lib/comidas/plan'
import { ESTADOS_COMIDA, ETIQUETA_CORTA_ESTADO, INFO_ESTADO, TIEMPOS_COMIDA } from '@/lib/comidas/tipos'

describe('claveCelda', () => {
  it('es distinta para cada día y comida de la semana', () => {
    const claves = new Set<string>()
    for (let dia = 1; dia <= 7; dia++) for (const comida of TIEMPOS_COMIDA) claves.add(claveCelda(dia, comida))
    expect(claves.size).toBe(21)
  })

  it('es estable', () => {
    expect(claveCelda(2, 'almuerzo')).toBe(claveCelda(2, 'almuerzo'))
  })
})

describe('celdasDesdePlan', () => {
  it('aplana el plan por clave de celda y omite lo no definido', () => {
    const celdas = celdasDesdePlan({
      2: { almuerzo: { estado: 'temprano', nota: '12:00' } },
      7: { cena: { estado: 'no', nota: null }, desayuno: undefined },
    })
    expect(celdas).toEqual({
      [claveCelda(2, 'almuerzo')]: { estado: 'temprano', nota: '12:00' },
      [claveCelda(7, 'cena')]: { estado: 'no', nota: null },
    })
  })
})

describe('conCelda', () => {
  const k = claveCelda(2, 'almuerzo')

  it('pone o reemplaza el valor sin tocar el original', () => {
    const antes = { [k]: { estado: 'si', nota: null } } as const
    const despues = conCelda(antes, k, { estado: 'tarde', nota: '13:00' })
    expect(despues).toEqual({ [k]: { estado: 'tarde', nota: '13:00' } })
    expect(antes[k]).toEqual({ estado: 'si', nota: null })
  })

  it('null quita la celda (sin definir)', () => {
    expect(conCelda({ [k]: { estado: 'si', nota: null } }, k, null)).toEqual({})
  })
})

describe('hayQueGuardar', () => {
  it.each([
    ['sin cambios', { estado: 'si', nota: null }, { estado: 'si', nota: null }, false],
    ['los dos sin definir', null, null, false],
    ['otro estado', { estado: 'si', nota: null }, { estado: 'no', nota: null }, true],
    ['otra hora', { estado: 'tarde', nota: '13:00' }, { estado: 'tarde', nota: '13:30' }, true],
    ['de sin definir a un estado', null, { estado: 'bolsa', nota: null }, true],
    ['de un estado a sin definir', { estado: 'bolsa', nota: null }, null, true],
  ] as const)('%s', (_caso, pedido, nuevo, esperado) => {
    expect(hayQueGuardar(pedido, nuevo)).toBe(esperado)
  })
})

describe('etiquetaCelda', () => {
  it('dice día, comida, estado completo con su hora, y qué hace el botón', () => {
    expect(etiquetaCelda(2, 'almuerzo', { estado: 'temprano', nota: '12:00' })).toBe(
      'Martes, almuerzo: Comer temprano 12:00. Cambiar',
    )
  })

  it('sin definir incluye el texto visible "Falta"', () => {
    expect(etiquetaCelda(7, 'cena', null)).toBe('Domingo, cena: Falta, sin definir. Cambiar')
  })

  it('enfermo lleva su nota', () => {
    expect(etiquetaCelda(3, 'desayuno', { estado: 'enfermo', nota: 'Sopa' })).toBe(
      'Miércoles, desayuno: Enfermo, Sopa. Cambiar',
    )
  })

  it('un estado sin nota', () => {
    expect(etiquetaCelda(1, 'desayuno', { estado: 'si', nota: null })).toBe('Lunes, desayuno: Sí comer. Cambiar')
  })
})

describe('mensajeFalloCelda', () => {
  it('dice qué celda volvió atrás, sin repetir "No se pudo guardar"', () => {
    expect(mensajeFalloCelda(2, 'almuerzo', 'No se pudo guardar. Intentá de nuevo.')).toBe(
      'No se pudo guardar el almuerzo del martes. Intentá de nuevo.',
    )
    expect(mensajeFalloCelda(7, 'cena', 'No se pudo guardar. Revisá tu conexión e intentá de nuevo.')).toBe(
      'No se pudo guardar la cena del domingo. Revisá tu conexión e intentá de nuevo.',
    )
  })

  it('con otro motivo, lo agrega después', () => {
    expect(mensajeFalloCelda(1, 'desayuno', 'No tenés permiso para hacer esto.')).toBe(
      'No se pudo guardar el desayuno del lunes. No tenés permiso para hacer esto.',
    )
  })
})

describe('ETIQUETA_CORTA_ESTADO', () => {
  it('cada texto corto está contenido en la etiqueta completa (lo visible forma parte del nombre accesible)', () => {
    for (const estado of ESTADOS_COMIDA) {
      expect(INFO_ESTADO[estado].etiqueta.toLowerCase()).toContain(ETIQUETA_CORTA_ESTADO[estado].toLowerCase())
    }
  })
})
