import { describe, expect, it } from 'vitest'
import {
  agregarAnteriores,
  alternarReaccionLocal,
  aplicarBorradoMensaje,
  aplicarInsercionMensaje,
  armarFeed,
  cursorAnteriores,
  fijarReaccion,
  tieneReaccion,
  type MensajeFila,
  type PublicacionFila,
} from '@/lib/mensajes/feed'

/** Marca como la devuelve PostgREST, en el minuto indicado. */
const T = (minuto: number) => `2026-09-16T16:${String(minuto).padStart(2, '0')}:00.000000+00:00`

function fila(id: string, creadoEn: string, padreId: string | null = null, autorId = 'u1'): MensajeFila {
  return { id, autor_id: autorId, padre_id: padreId, texto: `texto ${id}`, creado_en: creadoEn }
}

/** Publicación como la devuelve la consulta del feed (respuestas y reacciones embebidas). */
function pub(
  id: string,
  creadoEn: string,
  { respuestas = [], reacciones = [], autorId = 'u1' }: { respuestas?: MensajeFila[]; reacciones?: string[]; autorId?: string } = {},
): PublicacionFila {
  return { ...fila(id, creadoEn, null, autorId), respuestas, reacciones: reacciones.map((usuario_id) => ({ usuario_id })) }
}

describe('armarFeed', () => {
  it('ordena publicaciones de más nueva a más antigua y respuestas en orden cronológico', () => {
    const feed = armarFeed([
      pub('p1', T(1), { respuestas: [fila('r2', T(5), 'p1'), fila('r1', T(2), 'p1')] }),
      pub('p2', T(3)),
    ])
    expect(feed.map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(feed[1].respuestas.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(feed[0].respuestas).toEqual([])
  })

  it('convierte las filas al formato del feed', () => {
    const [p] = armarFeed([
      pub('p1', T(1), { autorId: 'autor', respuestas: [fila('r1', T(2), 'p1', 'otro')], reacciones: ['u2', 'u3'] }),
    ])
    expect(p).toEqual({
      id: 'p1',
      autorId: 'autor',
      texto: 'texto p1',
      creadoEn: T(1),
      reacciones: ['u2', 'u3'],
      respuestas: [{ id: 'r1', autorId: 'otro', texto: 'texto r1', creadoEn: T(2) }],
    })
  })

  it('a igual instante desempata por id descendente, como la consulta', () => {
    expect(armarFeed([pub('a', T(1)), pub('b', T(1))]).map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('no repite a quien reaccionó', () => {
    expect(armarFeed([pub('p1', T(1), { reacciones: ['u2', 'u2'] })])[0].reacciones).toEqual(['u2'])
  })
})

describe('páginas anteriores', () => {
  it('agrega sin duplicar y mantiene el orden', () => {
    const actual = armarFeed([pub('p3', T(3)), pub('p2', T(2))])
    const anteriores = armarFeed([pub('p2', T(2)), pub('p1', T(1))])
    expect(agregarAnteriores(actual, anteriores).map((p) => p.id)).toEqual(['p3', 'p2', 'p1'])
  })

  it('el cursor es el creado_en de la publicación más antigua, sin reformatear', () => {
    const feed = armarFeed([pub('p2', T(2)), pub('p1', '2026-09-16T16:01:00.123456+00:00')])
    expect(cursorAnteriores(feed)).toBe('2026-09-16T16:01:00.123456+00:00')
    expect(cursorAnteriores([])).toBeNull()
  })
})

describe('eventos de tiempo real', () => {
  const base = () =>
    armarFeed([pub('p1', T(1), { respuestas: [fila('r1', T(4), 'p1')], reacciones: ['u2'] }), pub('p3', T(3))])

  it('INSERT de publicación la ubica por fecha', () => {
    expect(aplicarInsercionMensaje(base(), fila('p2', T(2))).map((p) => p.id)).toEqual(['p3', 'p2', 'p1'])
  })

  it('INSERT repetido (acción propia + evento) no duplica y devuelve el mismo estado', () => {
    const antes = base()
    expect(aplicarInsercionMensaje(antes, fila('p3', T(3)))).toBe(antes)
    expect(aplicarInsercionMensaje(antes, fila('r1', T(4), 'p1'))).toBe(antes)
  })

  it('INSERT de respuesta la agrega en orden cronológico bajo su publicación', () => {
    const feed = aplicarInsercionMensaje(base(), fila('r0', T(2), 'p1'))
    expect(feed.find((p) => p.id === 'p1')!.respuestas.map((r) => r.id)).toEqual(['r0', 'r1'])
  })

  it('INSERT de respuesta a una publicación no cargada se ignora', () => {
    const antes = base()
    expect(aplicarInsercionMensaje(antes, fila('rx', T(5), 'vieja'))).toBe(antes)
  })

  it('DELETE quita una publicación o una respuesta por id', () => {
    expect(aplicarBorradoMensaje(base(), 'p3').map((p) => p.id)).toEqual(['p1'])
    expect(aplicarBorradoMensaje(base(), 'r1').find((p) => p.id === 'p1')!.respuestas).toEqual([])
    const antes = base()
    expect(aplicarBorradoMensaje(antes, 'desconocido')).toBe(antes)
  })

  it('no modifica el estado recibido', () => {
    const antes = base()
    const copia = structuredClone(antes)
    aplicarInsercionMensaje(antes, fila('p2', T(2)))
    aplicarInsercionMensaje(antes, fila('r0', T(2), 'p1'))
    aplicarBorradoMensaje(antes, 'r1')
    aplicarBorradoMensaje(antes, 'p3')
    fijarReaccion(antes, 'p1', 'u9', true)
    expect(antes).toEqual(copia)
  })
})

describe('reacciones', () => {
  const base = () => armarFeed([pub('p1', T(1), { reacciones: ['u2'] })])

  it('fijarReaccion es idempotente (eventos, optimismo y reversión)', () => {
    const antes = base()
    expect(fijarReaccion(antes, 'p1', 'u2', true)).toBe(antes)
    expect(fijarReaccion(antes, 'p1', 'u3', false)).toBe(antes)
    expect(fijarReaccion(antes, 'desconocido', 'u2', true)).toBe(antes)
    expect(fijarReaccion(antes, 'p1', 'u3', true)[0].reacciones).toEqual(['u2', 'u3'])
    expect(fijarReaccion(antes, 'p1', 'u2', false)[0].reacciones).toEqual([])
  })

  it('alternarReaccionLocal pone o quita y devuelve el estado final', () => {
    const quitada = alternarReaccionLocal(base(), 'p1', 'u2')
    expect(quitada.presente).toBe(false)
    expect(tieneReaccion(quitada.feed, 'p1', 'u2')).toBe(false)
    const puesta = alternarReaccionLocal(base(), 'p1', 'u3')
    expect(puesta.presente).toBe(true)
    expect(tieneReaccion(puesta.feed, 'p1', 'u3')).toBe(true)
  })

  it('revertir un cambio optimista deja el estado original', () => {
    const antes = base()
    const { feed, presente } = alternarReaccionLocal(antes, 'p1', 'u3')
    expect(fijarReaccion(feed, 'p1', 'u3', !presente)).toEqual(antes)
  })
})
