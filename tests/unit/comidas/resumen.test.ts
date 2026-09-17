import { describe, expect, it } from 'vitest'
import { resumenComida, textoResumen } from '@/lib/comidas/resumen'
import type { EstadoComida, ValorEfectivo } from '@/lib/comidas/tipos'

function v(estado: EstadoComida, nota: string | null = null, origen: 'plan' | 'persona' = 'plan'): ValorEfectivo {
  return { estado, nota, origen }
}

describe('resumenComida', () => {
  it('sin personas no tiene partes', () => {
    const resumen = resumenComida([])
    expect(resumen).toEqual({ total: 0, partes: [] })
    expect(textoResumen(resumen)).toBe('Sin personas')
  })

  it('cuenta por estado en orden fijo y deja "sin definir" al final', () => {
    const resumen = resumenComida([v('no'), null, v('si'), v('tarde', '13:30'), v('si')])
    expect(resumen).toEqual({
      total: 5,
      partes: [
        { clave: 'si', cantidad: 2, texto: '2 sí' },
        { clave: 'no', cantidad: 1, texto: '1 no' },
        { clave: 'tarde', cantidad: 1, texto: '1 tarde (13:30)' },
        { clave: 'sin_definir', cantidad: 1, texto: '1 sin definir' },
      ],
    })
  })

  it('agrupa y ordena las horas de temprano y tarde', () => {
    const resumen = resumenComida([v('tarde', '14:00'), v('tarde', '13:30'), v('temprano', '06:30'), v('tarde', '13:30')])
    expect(resumen.partes.map((p) => p.texto)).toEqual(['1 temprano (06:30)', '3 tarde (13:30 ×2, 14:00)'])
  })

  it('cuenta igual lo que viene del plan y lo que cambió la persona', () => {
    const resumen = resumenComida([v('si', null, 'plan'), v('si', null, 'persona')])
    expect(resumen.partes).toEqual([{ clave: 'si', cantidad: 2, texto: '2 sí' }])
  })

  it('no muestra la nota de enfermo y nombra "en bolsa"', () => {
    const resumen = resumenComida([v('enfermo', 'Solo sopa'), v('bolsa')])
    expect(resumen.partes.map((p) => p.texto)).toEqual(['1 en bolsa', '1 enfermo'])
  })

  it('una hora sin nota no agrega paréntesis', () => {
    expect(resumenComida([v('tarde')]).partes[0].texto).toBe('1 tarde')
  })
})

describe('textoResumen', () => {
  it('une las partes con un punto medio', () => {
    expect(textoResumen(resumenComida([v('si'), v('tarde', '13:30'), null]))).toBe('1 sí · 1 tarde (13:30) · 1 sin definir')
  })
})
