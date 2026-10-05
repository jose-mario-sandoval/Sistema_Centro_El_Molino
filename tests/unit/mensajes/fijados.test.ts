import { describe, expect, it } from 'vitest'
import type { Publicacion } from '@/lib/mensajes/feed'
import {
  DURACIONES_FIJADO,
  estaFijada,
  fijadoHasta,
  puedeFijar,
  separarFijadas,
  textoFijado,
} from '@/lib/mensajes/fijados'

/** Sábado 26/9/2026, 14:00 en El Salvador (UTC-6, sin horario de verano). */
const AHORA = new Date('2026-09-26T20:00:00.000Z')

function pub(id: string, fijado: { en: string; hasta?: string | null; por?: string | null } | null = null): Publicacion {
  return {
    id,
    autorId: 'u1',
    texto: `texto ${id}`,
    creadoEn: '2026-09-20T12:00:00.000000+00:00',
    estado: 'aprobado',
    motivoRechazo: null,
    reacciones: [],
    respuestas: [],
    fijadoEn: fijado?.en ?? null,
    fijadoHasta: fijado?.hasta ?? null,
    fijadoPor: fijado?.por ?? null,
  }
}

describe('fijadoHasta', () => {
  it('"Hasta que lo quite" no tiene fin', () => {
    expect(fijadoHasta('siempre', AHORA)).toBeNull()
  })

  it('por 1, 3 y 7 días cuenta desde ahora', () => {
    expect(fijadoHasta('1d', AHORA)?.toISOString()).toBe('2026-09-27T20:00:00.000Z')
    expect(fijadoHasta('3d', AHORA)?.toISOString()).toBe('2026-09-29T20:00:00.000Z')
    expect(fijadoHasta('7d', AHORA)?.toISOString()).toBe('2026-10-03T20:00:00.000Z')
  })

  it('"hasta el día" dura todo ese día: termina a la medianoche siguiente en la casa', () => {
    expect(fijadoHasta('fecha', AHORA, '2026-10-01')?.toISOString()).toBe('2026-10-02T06:00:00.000Z')
    // Hoy mismo: hasta el final de hoy.
    expect(fijadoHasta('fecha', AHORA, '2026-09-26')?.toISOString()).toBe('2026-09-27T06:00:00.000Z')
  })

  it('"hasta el día" usa la fecha de la casa, no la de UTC', () => {
    // 23:30 del sábado en la casa, ya domingo en UTC: "hasta hoy" sigue siendo hasta el final del sábado.
    const tarde = new Date('2026-09-27T05:30:00.000Z')
    const fin = fijadoHasta('fecha', tarde, '2026-09-26')
    expect(fin?.toISOString()).toBe('2026-09-27T06:00:00.000Z')
    expect(fin!.getTime()).toBeGreaterThan(tarde.getTime())
  })

  it('"hasta el día" sin fecha es un error de programación', () => {
    expect(() => fijadoHasta('fecha', AHORA)).toThrow()
  })

  it('las duraciones son las que ofrece la pantalla', () => {
    expect(DURACIONES_FIJADO).toEqual(['siempre', '1d', '3d', '7d', 'fecha'])
  })
})

describe('estaFijada', () => {
  it('sin fijar, no', () => {
    expect(estaFijada(pub('p'), AHORA)).toBe(false)
  })

  it('sin fin, siempre', () => {
    expect(estaFijada(pub('p', { en: '2026-01-01T00:00:00Z' }), AHORA)).toBe(true)
  })

  it('con fin, hasta que llega', () => {
    const conFin = (hasta: string) => pub('p', { en: '2026-09-25T00:00:00Z', hasta })
    expect(estaFijada(conFin('2026-09-26T20:00:01.000Z'), AHORA)).toBe(true)
    expect(estaFijada(conFin('2026-09-26T20:00:00.000Z'), AHORA)).toBe(false)
    expect(estaFijada(conFin('2026-09-26T14:00:00-06:00'), AHORA)).toBe(false)
    expect(estaFijada(conFin('2026-09-20T00:00:00.000000+00:00'), AHORA)).toBe(false)
  })
})

describe('separarFijadas', () => {
  it('las vigentes van arriba, la última fijada primero, y no se repiten en el resto', () => {
    const feed = [
      pub('p4'),
      pub('p3', { en: '2026-09-21T00:00:00.000000+00:00' }),
      pub('p2', { en: '2026-09-25T00:00:00.000000+00:00', hasta: '2026-09-30T00:00:00+00:00' }),
      pub('p1', { en: '2026-09-22T00:00:00.000000+00:00', hasta: '2026-09-23T00:00:00+00:00' }), // vencida
      pub('p0'),
    ]
    const { fijadas, resto } = separarFijadas(feed, AHORA)
    expect(fijadas.map((p) => p.id)).toEqual(['p2', 'p3'])
    expect(resto.map((p) => p.id)).toEqual(['p4', 'p1', 'p0'])
  })

  it('a igual momento de fijado, desempata por id como el feed', () => {
    const en = '2026-09-21T00:00:00.000000+00:00'
    expect(separarFijadas([pub('a', { en }), pub('b', { en })], AHORA).fijadas.map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('sin fijadas devuelve el feed entero como resto', () => {
    const feed = [pub('p2'), pub('p1')]
    const { fijadas, resto } = separarFijadas(feed, AHORA)
    expect(fijadas).toEqual([])
    expect(resto).toEqual(feed)
  })
})

describe('textoFijado', () => {
  it('sin fin', () => {
    expect(textoFijado(null, 'director')).toBe('Fijado por el Director hasta que lo quiten')
  })

  it('hasta un día entero: el día, sin la hora de medianoche', () => {
    expect(textoFijado('2026-10-02T06:00:00+00:00', 'administracion')).toBe('Fijado por Administración hasta el jueves 1/10')
  })

  it('hasta una hora: día y hora de la casa', () => {
    expect(textoFijado('2026-10-01T20:05:00.000Z', 'director')).toBe('Fijado por el Director hasta el jueves 1/10 a las 14:05')
  })

  it('sin saber quién la fijó (perfil borrado), no nombra a nadie', () => {
    expect(textoFijado(null, null)).toBe('Fijado hasta que lo quiten')
    expect(textoFijado(null, 'residente')).toBe('Fijado hasta que lo quiten')
  })
})

describe('puedeFijar', () => {
  it('Director y Administración, nadie más', () => {
    expect(puedeFijar('director')).toBe(true)
    expect(puedeFijar('administracion')).toBe(true)
    expect(puedeFijar('residente')).toBe(false)
  })
})
