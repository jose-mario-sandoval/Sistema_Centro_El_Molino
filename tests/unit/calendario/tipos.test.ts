import { describe, expect, it } from 'vitest'
import {
  alternarRequerimiento,
  eventoParaAdministracion,
  textoRequerimientos,
  type EventoParaCocina,
} from '@/lib/calendario/tipos'

describe('textoRequerimientos', () => {
  it('resume lo que debe preparar la cocina', () => {
    expect(textoRequerimientos(['merienda'])).toBe('Merienda')
    expect(textoRequerimientos(['comida'])).toBe('Comida')
    expect(textoRequerimientos(['materiales'])).toBe('Solo materiales de cocina')
    expect(textoRequerimientos(['merienda', 'comida'])).toBe('Merienda y comida')
  })

  it('siempre en el mismo orden, sin importar cómo se marcó', () => {
    expect(textoRequerimientos(['comida', 'merienda'])).toBe('Merienda y comida')
  })

  it('sin pedidos no hay texto', () => {
    expect(textoRequerimientos([])).toBe('')
  })
})

describe('eventoParaAdministracion', () => {
  const desdeLaBase: EventoParaCocina = { id: 'e1', fecha: '2026-10-07', hora: '16:00:00', requiere_cocina: ['merienda', 'comida'] }

  it('deja fecha, hora y qué preparar; sin tipo, y el título es lo que hay que preparar', () => {
    expect(eventoParaAdministracion(desdeLaBase)).toEqual({
      id: 'e1',
      fecha: '2026-10-07',
      hora: '16:00:00',
      titulo: 'Merienda y comida',
      tipo: null,
      requiere_cocina: ['merienda', 'comida'],
    })
  })

  it('no arrastra ningún campo que la base no le dio', () => {
    const conDatosDeMas = { ...desdeLaBase, titulo: 'Retiro secreto', tipo: 'retiro' } as EventoParaCocina
    const resultado = eventoParaAdministracion(conDatosDeMas)
    expect(resultado.titulo).toBe('Merienda y comida')
    expect(resultado.tipo).toBeNull()
    expect(JSON.stringify(resultado)).not.toContain('secreto')
  })
})

describe('alternarRequerimiento', () => {
  it('marca y desmarca una casilla', () => {
    expect(alternarRequerimiento([], 'merienda')).toEqual(['merienda'])
    expect(alternarRequerimiento(['merienda'], 'merienda')).toEqual([])
  })

  it('merienda y comida se combinan', () => {
    expect(alternarRequerimiento(['merienda'], 'comida')).toEqual(['merienda', 'comida'])
  })

  it('marcar "solo materiales" desmarca lo demás', () => {
    expect(alternarRequerimiento(['merienda', 'comida'], 'materiales')).toEqual(['materiales'])
  })

  it('marcar merienda o comida desmarca "solo materiales"', () => {
    expect(alternarRequerimiento(['materiales'], 'comida')).toEqual(['comida'])
  })

  it('no modifica la lista original', () => {
    const original = ['merienda'] as const
    alternarRequerimiento(original, 'comida')
    expect(original).toEqual(['merienda'])
  })
})
