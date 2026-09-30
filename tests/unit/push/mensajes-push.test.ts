import { describe, expect, it } from 'vitest'
import {
  cargaMensajePendiente,
  cargaModeracion,
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

describe('mensaje por aprobar (a los Directores)', () => {
  it('una publicación: abre los pendientes y reemplaza el aviso anterior', () => {
    expect(cargaMensajePendiente({ autor: 'Juan Pérez', tipo: 'publicacion', pendientes: 1 })).toEqual({
      titulo: 'Mensaje por aprobar',
      cuerpo: 'Juan Pérez publicó un mensaje que espera tu aprobación.',
      url: '/mensajes?vista=pendientes',
      etiqueta: 'mensajes-por-aprobar',
    })
  })

  it('con varios pendientes, el título dice cuántos (el aviso nuevo pisa al anterior)', () => {
    expect(cargaMensajePendiente({ autor: 'Ana', tipo: 'publicacion', pendientes: 3 }).titulo).toBe('3 mensajes por aprobar')
  })

  it('una respuesta y un mensaje corregido tras un rechazo', () => {
    expect(cargaMensajePendiente({ autor: 'Ana', tipo: 'respuesta', pendientes: 1 }).cuerpo).toBe(
      'Ana respondió en un hilo y la respuesta espera tu aprobación.',
    )
    expect(cargaMensajePendiente({ autor: 'Ana', tipo: 'correccion', pendientes: 1 }).cuerpo).toBe(
      'Ana corrigió su mensaje y espera tu aprobación.',
    )
  })
})

describe('moderación (al autor)', () => {
  it('aprobado: publicación y respuesta', () => {
    expect(cargaModeracion({ id: 'm1', estado: 'aprobado', esRespuesta: false, motivo: null })).toEqual({
      titulo: 'Tu mensaje fue aprobado',
      cuerpo: 'Ya lo pueden leer todos en Mensajes.',
      url: '/mensajes',
      etiqueta: 'moderacion-m1',
    })
    expect(cargaModeracion({ id: 'm2', estado: 'aprobado', esRespuesta: true, motivo: null })).toMatchObject({
      titulo: 'Tu respuesta fue aprobada',
      cuerpo: 'Ya la pueden leer todos en el hilo.',
    })
  })

  it('rechazado: con el motivo y qué hacer', () => {
    expect(cargaModeracion({ id: 'm1', estado: 'rechazado', esRespuesta: false, motivo: 'Falta la fecha' })).toEqual({
      titulo: 'Tu mensaje no fue aprobado',
      cuerpo: 'Motivo: Falta la fecha. Podés corregirlo y volver a enviarlo desde Mensajes.',
      url: '/mensajes',
      etiqueta: 'moderacion-m1',
    })
    expect(cargaModeracion({ id: 'm1', estado: 'rechazado', esRespuesta: true, motivo: null })).toMatchObject({
      titulo: 'Tu respuesta no fue aprobada',
      cuerpo: 'Podés corregirla y volver a enviarla desde Mensajes.',
    })
  })

  it('un motivo largo se recorta', () => {
    const { cuerpo } = cargaModeracion({ id: 'm1', estado: 'rechazado', esRespuesta: false, motivo: 'x'.repeat(500) })
    expect(Array.from(cuerpo).length).toBeLessThanOrEqual(LARGO_MAXIMO_CUERPO)
  })
})
