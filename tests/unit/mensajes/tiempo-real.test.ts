import { describe, expect, it } from 'vitest'
import { aplicarInsercionMensaje, armarFeed, fijarReaccion, type MensajeFila, type Publicacion } from '@/lib/mensajes/feed'
import { aplicarCambios, leerEvento, type CambioFeed, type EventoTiempoReal } from '@/lib/mensajes/tiempo-real'

const T = (minuto: number) => `2026-09-16T16:${String(minuto).padStart(2, '0')}:00.000000+00:00`

// Tipado explícito: sin él, `estado: 'aprobado'` se ampliaría a `string` (objeto literal sin
// contexto) y dejaría de encajar en MensajeFila donde se use este helper.
function mensaje(id: string, creadoEn: string, padreId: string | null = null, autorId = 'u1'): MensajeFila {
  return { id, autor_id: autorId, padre_id: padreId, texto: `texto ${id}`, creado_en: creadoEn, estado: 'aprobado', motivo_rechazo: null }
}

function evento(parcial: Partial<EventoTiempoReal> & Pick<EventoTiempoReal, 'table' | 'eventType'>): EventoTiempoReal {
  return { new: {}, old: {}, errors: [], ...parcial }
}

/** Aplica el cambio leído de un evento (falla si el evento se ignoró). */
function aplicar(feed: Publicacion[], e: EventoTiempoReal): Publicacion[] {
  const leido = leerEvento(e)
  expect(leido).not.toBeNull()
  return leido!.cambio(feed)
}

const base = () =>
  armarFeed([
    { ...mensaje('p1', T(1)), reacciones: [{ usuario_id: 'u2' }], respuestas: [mensaje('r1', T(2), 'p1')] },
  ])

describe('leerEvento', () => {
  it('INSERT de mensaje: agrega la fila y avisa el autor', () => {
    const leido = leerEvento(evento({ table: 'mensajes', eventType: 'INSERT', new: mensaje('p2', T(3), null, 'u7') }))
    expect(leido?.autorId).toBe('u7')
    expect(leido!.cambio(base()).map((p) => p.id)).toEqual(['p2', 'p1'])
  })

  it('INSERT de mensaje trae la hora de la base aunque el mensaje ya esté', () => {
    const propio = aplicarInsercionMensaje(base(), mensaje('p2', T(9)))
    const feed = aplicar(propio, evento({ table: 'mensajes', eventType: 'INSERT', new: mensaje('p2', T(3)) }))
    expect(feed.find((p) => p.id === 'p2')!.creadoEn).toBe(T(3))
  })

  it('DELETE de mensaje usa solo el id', () => {
    const feed = aplicar(base(), evento({ table: 'mensajes', eventType: 'DELETE', old: { id: 'r1' } }))
    expect(feed[0].respuestas).toEqual([])
  })

  it('INSERT y DELETE de reacción', () => {
    const puesta = aplicar(base(), evento({ table: 'reacciones', eventType: 'INSERT', new: { mensaje_id: 'p1', usuario_id: 'u3' } }))
    expect(puesta[0].reacciones).toEqual(['u2', 'u3'])
    const quitada = aplicar(puesta, evento({ table: 'reacciones', eventType: 'DELETE', old: { mensaje_id: 'p1', usuario_id: 'u2' } }))
    expect(quitada[0].reacciones).toEqual(['u3'])
  })

  it('ignora eventos con errores (RLS sin sesión: "Error 401" y fila vacía)', () => {
    expect(
      leerEvento(evento({ table: 'mensajes', eventType: 'INSERT', new: mensaje('p2', T(3)), errors: ['Error 401: Unauthorized'] })),
    ).toBeNull()
    expect(leerEvento(evento({ table: 'mensajes', eventType: 'INSERT', errors: ['Error 401: Unauthorized'] }))).toBeNull()
  })

  it('ignora filas incompletas o de tipos inesperados', () => {
    expect(leerEvento(evento({ table: 'mensajes', eventType: 'INSERT' }))).toBeNull()
    expect(leerEvento(evento({ table: 'mensajes', eventType: 'INSERT', new: { ...mensaje('p2', T(3)), id: undefined } }))).toBeNull()
    expect(leerEvento(evento({ table: 'mensajes', eventType: 'INSERT', new: { ...mensaje('p2', T(3)), padre_id: 5 } }))).toBeNull()
    expect(leerEvento(evento({ table: 'mensajes', eventType: 'DELETE' }))).toBeNull()
    expect(leerEvento(evento({ table: 'reacciones', eventType: 'INSERT', new: { mensaje_id: 'p1' } }))).toBeNull()
    expect(leerEvento(evento({ table: 'reacciones', eventType: 'DELETE', old: { usuario_id: 'u2' } }))).toBeNull()
    expect(leerEvento(evento({ table: 'otra', eventType: 'INSERT', new: mensaje('p1', T(1)) }))).toBeNull()
  })

  it('acepta un errors nulo o ausente', () => {
    expect(leerEvento({ table: 'mensajes', eventType: 'DELETE', new: {}, old: { id: 'p1' }, errors: null })).not.toBeNull()
    expect(leerEvento({ table: 'mensajes', eventType: 'DELETE', new: {}, old: { id: 'p1' } })).not.toBeNull()
  })
})

describe('leerEvento: UPDATE de mensajes', () => {
  const filaBase = {
    id: 'm1',
    autor_id: 'u1',
    padre_id: null,
    texto: 'Hola',
    creado_en: '2026-01-01T00:00:00.000000+00:00',
    estado: 'aprobado',
    motivo_rechazo: null,
  }

  it('traduce un UPDATE a un cambio del feed', () => {
    const resultado = leerEvento({ table: 'mensajes', eventType: 'UPDATE', new: filaBase, old: {} })
    expect(resultado?.autorId).toBe('u1')
    const siguiente = resultado!.cambio([])
    expect(siguiente).toEqual([{ id: 'm1', autorId: 'u1', texto: 'Hola', creadoEn: filaBase.creado_en, estado: 'aprobado', motivoRechazo: null, reacciones: [], respuestas: [] }])
  })

  it('un estado desconocido se ignora (fila inválida)', () => {
    const resultado = leerEvento({ table: 'mensajes', eventType: 'UPDATE', new: { ...filaBase, estado: 'algo-raro' }, old: {} })
    expect(resultado).toBeNull()
  })

  it('con errors (RLS lo bloqueó), se ignora', () => {
    const resultado = leerEvento({ table: 'mensajes', eventType: 'UPDATE', new: filaBase, old: {}, errors: ['Error 401'] })
    expect(resultado).toBeNull()
  })
})

describe('aplicarCambios: lo que llegó durante una recarga', () => {
  it('se vuelve a aplicar sobre los datos recargados sin duplicar lo que ya traen', () => {
    const cambios: CambioFeed[] = [
      // Publicación propia con la hora del navegador y su evento, ya incluida en la recarga: no se duplica
      // ni pierde la hora de la base.
      (feed) => aplicarInsercionMensaje(feed, mensaje('p2', T(9))),
      leerEvento(evento({ table: 'mensajes', eventType: 'INSERT', new: mensaje('p2', T(3)) }))!.cambio,
      // Posterior a la consulta: la recarga todavía no lo trae.
      leerEvento(evento({ table: 'mensajes', eventType: 'INSERT', new: mensaje('r2', T(4), 'p1') }))!.cambio,
      leerEvento(evento({ table: 'reacciones', eventType: 'DELETE', old: { mensaje_id: 'p1', usuario_id: 'u2' } }))!.cambio,
      // Reacción optimista propia.
      (feed) => fijarReaccion(feed, 'p2', 'yo', true),
    ]
    const recargado = armarFeed([
      { ...mensaje('p2', T(3)), reacciones: [], respuestas: [] },
      { ...mensaje('p1', T(1)), reacciones: [{ usuario_id: 'u2' }], respuestas: [mensaje('r1', T(2), 'p1')] },
    ])

    const feed = aplicarCambios(recargado, cambios)
    expect(feed.map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(feed[0].creadoEn).toBe(T(3))
    expect(feed[0].reacciones).toEqual(['yo'])
    expect(feed[1].reacciones).toEqual([])
    expect(feed[1].respuestas.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('sin cambios devuelve los datos recargados tal cual', () => {
    const recargado = base()
    expect(aplicarCambios(recargado, [])).toBe(recargado)
  })
})
