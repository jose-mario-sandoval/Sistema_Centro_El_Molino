import { describe, expect, it } from 'vitest'
import { agregarAnteriores, armarFeed, cursorAnteriores, type MensajeFila } from '@/lib/mensajes/feed'

/** Marca como la devuelve PostgREST, en el minuto indicado. */
const T = (minuto: number) => `2026-09-16T16:${String(minuto).padStart(2, '0')}:00.000000+00:00`

function fila(id: string, creadoEn: string, padreId: string | null = null, autorId = 'u1'): MensajeFila {
  return { id, autor_id: autorId, padre_id: padreId, texto: `texto ${id}`, creado_en: creadoEn }
}

describe('armarFeed', () => {
  it('ordena publicaciones de más nueva a más antigua y respuestas en orden cronológico', () => {
    const feed = armarFeed([fila('p1', T(1)), fila('r2', T(5), 'p1'), fila('p2', T(3)), fila('r1', T(2), 'p1')], [])
    expect(feed.map((p) => p.id)).toEqual(['p2', 'p1'])
    expect(feed[1].respuestas.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(feed[0].respuestas).toEqual([])
  })

  it('convierte las filas al formato del feed', () => {
    const [p] = armarFeed([fila('p1', T(1), null, 'autor')], [])
    expect(p).toEqual({ id: 'p1', autorId: 'autor', texto: 'texto p1', creadoEn: T(1), reacciones: [], respuestas: [] })
  })

  it('a igual instante desempata por id descendente, como la consulta', () => {
    expect(armarFeed([fila('a', T(1)), fila('b', T(1))], []).map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('ignora respuestas sin publicación cargada y reacciones de mensajes desconocidos', () => {
    const feed = armarFeed(
      [fila('p1', T(1)), fila('huerfana', T(2), 'otra')],
      [
        { mensaje_id: 'p1', usuario_id: 'u2' },
        { mensaje_id: 'otra', usuario_id: 'u3' },
        { mensaje_id: 'p1', usuario_id: 'u2' },
      ],
    )
    expect(feed).toHaveLength(1)
    expect(feed[0].respuestas).toEqual([])
    expect(feed[0].reacciones).toEqual(['u2'])
  })
})

describe('páginas anteriores', () => {
  it('agrega sin duplicar y mantiene el orden', () => {
    const actual = armarFeed([fila('p3', T(3)), fila('p2', T(2))], [])
    const anteriores = armarFeed([fila('p2', T(2)), fila('p1', T(1))], [])
    expect(agregarAnteriores(actual, anteriores).map((p) => p.id)).toEqual(['p3', 'p2', 'p1'])
  })

  it('el cursor es el creado_en de la publicación más antigua, sin reformatear', () => {
    const feed = armarFeed([fila('p2', T(2)), fila('p1', '2026-09-16T16:01:00.123456+00:00')], [])
    expect(cursorAnteriores(feed)).toBe('2026-09-16T16:01:00.123456+00:00')
    expect(cursorAnteriores([])).toBeNull()
  })
})
