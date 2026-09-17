import { describe, expect, it } from 'vitest'
import {
  cargaNuevaPublicacion,
  cargaNuevaRespuesta,
  cargaRecordatorio,
  LARGO_MAXIMO_CUERPO,
  recortar,
} from '@/lib/push/mensajes-push'

describe('recortar', () => {
  it('normaliza espacios y saltos de línea', () => {
    expect(recortar('  Hola\n\n  a   todos ')).toBe('Hola a todos')
  })

  it('corta textos largos con puntos suspensivos', () => {
    const texto = recortar('a'.repeat(200))
    expect(texto).toHaveLength(LARGO_MAXIMO_CUERPO)
    expect(texto.endsWith('…')).toBe(true)
  })

  it('cuenta caracteres completos y no parte un emoji por la mitad', () => {
    const texto = recortar('🎉'.repeat(200))
    expect(Array.from(texto)).toHaveLength(LARGO_MAXIMO_CUERPO)
    expect(texto.endsWith('🎉…')).toBe(true)
  })

  it('no recorta un texto de emojis que cabe entero', () => {
    const cabe = '🎉'.repeat(LARGO_MAXIMO_CUERPO)
    expect(recortar(cabe)).toBe(cabe)
  })
})

describe('mensajes', () => {
  it('nueva publicación abre Mensajes', () => {
    expect(cargaNuevaPublicacion({ id: 'm1', autor: 'Juan Pérez', texto: 'Hola   a todos\n' })).toEqual({
      titulo: 'Juan Pérez publicó un mensaje',
      cuerpo: 'Hola a todos',
      url: '/mensajes',
      etiqueta: 'mensaje-m1',
    })
  })

  it('nueva respuesta abre Mensajes', () => {
    expect(cargaNuevaRespuesta({ id: 'r1', autor: 'Ana Torres', texto: 'De acuerdo' })).toEqual({
      titulo: 'Ana Torres respondió en un hilo',
      cuerpo: 'De acuerdo',
      url: '/mensajes',
      etiqueta: 'mensaje-r1',
    })
  })
})

describe('cargaRecordatorio', () => {
  it('cierre hoy', () => {
    expect(
      cargaRecordatorio({
        fecha: '2026-09-17',
        comida: 'desayuno',
        cierre: new Date('2026-09-17T03:00:00.000Z'),
        ahora: new Date('2026-09-16T20:15:00-06:00'),
      }),
    ).toEqual({
      titulo: 'Falta definir: Desayuno del jueves 17',
      cuerpo: 'Cierra hoy a las 21:00. Elegí tu opción en Semana.',
      url: '/comidas/semana',
      etiqueta: 'recordatorio-2026-09-17-desayuno',
    })
  })

  it('cierre después de medianoche', () => {
    expect(
      cargaRecordatorio({
        fecha: '2026-09-22',
        comida: 'desayuno',
        cierre: new Date('2026-09-21T06:30:00.000Z'),
        ahora: new Date('2026-09-20T23:45:00-06:00'),
      }).cuerpo,
    ).toBe('Cierra mañana a las 00:30. Elegí tu opción en Semana.')
  })
})
