import { describe, expect, it } from 'vitest'
import {
  agregarAnteriores,
  aplicarActualizacionMensaje,
  aplicarBorradoMensaje,
  aplicarFijado,
  aplicarInsercionMensaje,
  armarFeed,
  cursorAnteriores,
  fijarReaccion,
  publicaDirecto,
  tieneReaccion,
  type MensajeFila,
  type Publicacion,
  type PublicacionFila,
} from '@/lib/mensajes/feed'

/** Marca como la devuelve PostgREST, en el minuto indicado. */
const T = (minuto: number) => `2026-09-16T16:${String(minuto).padStart(2, '0')}:00.000000+00:00`

function fila(id: string, creadoEn: string, padreId: string | null = null, autorId = 'u1'): MensajeFila {
  return {
    id,
    autor_id: autorId,
    padre_id: padreId,
    texto: `texto ${id}`,
    creado_en: creadoEn,
    estado: 'aprobado',
    motivo_rechazo: null,
    fijado_en: null,
    fijado_hasta: null,
    fijado_por: null,
  }
}

const SIN_FIJAR = { fijadoEn: null, fijadoHasta: null, fijadoPor: null }

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
      estado: 'aprobado',
      motivoRechazo: null,
      reacciones: ['u2', 'u3'],
      respuestas: [{ id: 'r1', autorId: 'otro', texto: 'texto r1', creadoEn: T(2), estado: 'aprobado', motivoRechazo: null }],
      ...SIN_FIJAR,
    })
  })

  it('lleva los datos de fijado de la publicación', () => {
    const fijada = { ...pub('p1', T(1)), fijado_en: T(5), fijado_hasta: T(9), fijado_por: 'dir' }
    expect(armarFeed([fijada])[0]).toMatchObject({ fijadoEn: T(5), fijadoHasta: T(9), fijadoPor: 'dir' })
  })

  it('a igual instante desempata por id descendente, como la consulta', () => {
    expect(armarFeed([pub('a', T(1)), pub('b', T(1))]).map((p) => p.id)).toEqual(['b', 'a'])
  })

  it('ordena por microsegundos, como la consulta, aunque Date solo tenga milisegundos', () => {
    const U = (microsegundos: string) => `2026-09-16T16:00:00.123${microsegundos}+00:00`
    // Con milisegundos serían iguales y el desempate por id daría z, m, a.
    const feed = armarFeed([
      pub('a', U('457'), { respuestas: [fila('r2', U('999'), 'a'), fila('r1', U('001'), 'a')] }),
      pub('z', U('456')),
      pub('m', U('458')),
    ])
    expect(feed.map((p) => p.id)).toEqual(['m', 'a', 'z'])
    expect(feed[1].respuestas.map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(cursorAnteriores(feed)).toBe(U('456'))
  })

  it('compara marcas con distinta cantidad de decimales y con la hora del navegador', () => {
    const feed = armarFeed([
      pub('a', '2026-09-16T16:00:00.12+00:00'),
      pub('b', '2026-09-16T16:00:00.119999+00:00'),
      pub('c', '2026-09-16T16:00:00+00:00'),
      pub('d', '2026-09-16T16:00:00.1205Z'),
      pub('e', '2026-09-16T13:00:00.121-03:00'),
    ])
    expect(feed.map((p) => p.id)).toEqual(['e', 'd', 'a', 'b', 'c'])
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
    expect(aplicarInsercionMensaje(antes, fila('p3', T(3)), { desdeEvento: true })).toBe(antes)
    expect(aplicarInsercionMensaje(antes, fila('r1', T(4), 'p1'), { desdeEvento: true })).toBe(antes)
  })

  it('el evento de un mensaje propio ya agregado corrige su hora con la de la base', () => {
    // Publicación propia agregada con la hora del navegador (adelantada): queda arriba de p3.
    const propio = aplicarInsercionMensaje(base(), fila('p2', T(9)))
    expect(propio.map((p) => p.id)).toEqual(['p2', 'p3', 'p1'])
    const confirmado = aplicarInsercionMensaje(propio, fila('p2', T(2)), { desdeEvento: true })
    expect(confirmado.map((p) => p.id)).toEqual(['p3', 'p2', 'p1'])
    expect(confirmado[1].creadoEn).toBe(T(2))

    // Respuesta propia: se reordena dentro del hilo.
    const respuesta = aplicarInsercionMensaje(base(), fila('r2', T(9), 'p1'))
    const hilo = aplicarInsercionMensaje(respuesta, fila('r2', T(2), 'p1'), { desdeEvento: true })
    expect(hilo.find((p) => p.id === 'p1')!.respuestas.map((r) => [r.id, r.creadoEn])).toEqual([
      ['r2', T(2)],
      ['r1', T(4)],
    ])
  })

  it('el mensaje propio repetido no pisa la hora que ya vino de la base', () => {
    const confirmado = aplicarInsercionMensaje(base(), fila('p2', T(2)), { desdeEvento: true })
    expect(aplicarInsercionMensaje(confirmado, fila('p2', T(9)))).toBe(confirmado)
  })

  it('un reintento idempotente (mismo id, otra hora del navegador) no duplica el mensaje propio', () => {
    const propio = aplicarInsercionMensaje(base(), fila('p2', T(8)))
    expect(aplicarInsercionMensaje(propio, fila('p2', T(9)))).toBe(propio)
    const respuesta = aplicarInsercionMensaje(base(), fila('r2', T(8), 'p1'))
    expect(aplicarInsercionMensaje(respuesta, fila('r2', T(9), 'p1'))).toBe(respuesta)
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

  it('revertir un cambio optimista deja el estado original', () => {
    const antes = base()
    const presente = !tieneReaccion(antes, 'p1', 'u3')
    const optimista = fijarReaccion(antes, 'p1', 'u3', presente)
    expect(tieneReaccion(optimista, 'p1', 'u3')).toBe(true)
    expect(fijarReaccion(optimista, 'p1', 'u3', !presente)).toEqual(antes)
  })
})

describe('aplicarActualizacionMensaje', () => {
  const base = {
    id: 'm1',
    autor_id: 'u1',
    padre_id: null,
    texto: 'Hola',
    creado_en: '2026-01-01T00:00:00.000000+00:00',
    fijado_en: null,
    fijado_hasta: null,
    fijado_por: null,
  }

  it('actualiza el estado de una publicación que ya estaba en el feed', () => {
    const feed: Publicacion[] = [{ id: 'm1', autorId: 'u1', texto: 'Hola', creadoEn: base.creado_en, estado: 'pendiente', motivoRechazo: null, reacciones: [], respuestas: [], ...SIN_FIJAR }]
    const siguiente = aplicarActualizacionMensaje(feed, { ...base, estado: 'aprobado', motivo_rechazo: null })
    expect(siguiente[0].estado).toBe('aprobado')
  })

  it('una publicación que no está cargada (recién aprobada, fijada o quitada) no se inserta a medias: el feed la trae completa', () => {
    const antes = armarFeed([pub('p1', T(1))])
    for (const fijado of [{}, { fijado_en: T(5), fijado_hasta: null, fijado_por: 'dir' }]) {
      expect(aplicarActualizacionMensaje(antes, { ...base, estado: 'aprobado', motivo_rechazo: null, ...fijado })).toBe(antes)
    }
  })

  it('una respuesta que se vuelve visible se agrega bajo su padre si el padre está cargado', () => {
    const feed: Publicacion[] = [{ id: 'padre', autorId: 'u2', texto: 'Publicación', creadoEn: '2026-01-01T00:00:00.000000+00:00', estado: 'aprobado', motivoRechazo: null, reacciones: [], respuestas: [], ...SIN_FIJAR }]
    const siguiente = aplicarActualizacionMensaje(feed, { ...base, id: 'r1', padre_id: 'padre', estado: 'aprobado', motivo_rechazo: null })
    expect(siguiente[0].respuestas).toHaveLength(1)
    expect(siguiente[0].respuestas[0].id).toBe('r1')
  })

  it('una respuesta cuyo padre no está cargado no rompe nada: el feed queda igual', () => {
    const siguiente = aplicarActualizacionMensaje([], { ...base, id: 'r1', padre_id: 'padre-no-cargado', estado: 'aprobado', motivo_rechazo: null })
    expect(siguiente).toEqual([])
  })

  it('actualiza una respuesta que ya estaba cargada', () => {
    const feed: Publicacion[] = [{ id: 'padre', autorId: 'u2', texto: 'Publicación', creadoEn: '2026-01-01T00:00:00.000000+00:00', estado: 'aprobado', motivoRechazo: null, reacciones: [], respuestas: [{ id: 'r1', autorId: 'u1', texto: 'Vieja', creadoEn: base.creado_en, estado: 'pendiente', motivoRechazo: null }], ...SIN_FIJAR }]
    const siguiente = aplicarActualizacionMensaje(feed, { ...base, id: 'r1', padre_id: 'padre', texto: 'Corregida', estado: 'rechazado', motivo_rechazo: 'Ofensivo' })
    expect(siguiente[0].respuestas[0]).toEqual({ id: 'r1', autorId: 'u1', texto: 'Corregida', creadoEn: base.creado_en, estado: 'rechazado', motivoRechazo: 'Ofensivo' })
  })

  it('lleva fijar y desfijar a una publicación cargada, sin perder reacciones ni respuestas', () => {
    const cargada = armarFeed([pub('m1', base.creado_en, { reacciones: ['u2'], respuestas: [fila('r1', T(2), 'm1')] })])
    const fijada = aplicarActualizacionMensaje(cargada, { ...base, estado: 'aprobado', motivo_rechazo: null, fijado_en: T(5), fijado_hasta: null, fijado_por: 'adm' })
    expect(fijada[0]).toMatchObject({ fijadoEn: T(5), fijadoHasta: null, fijadoPor: 'adm', reacciones: ['u2'] })
    expect(fijada[0].respuestas).toHaveLength(1)
    const desfijada = aplicarActualizacionMensaje(fijada, { ...base, estado: 'aprobado', motivo_rechazo: null })
    expect(desfijada[0]).toMatchObject(SIN_FIJAR)
  })
})

describe('publicaDirecto', () => {
  it('Director y Administración publican sin aprobación; Residente espera', () => {
    expect(publicaDirecto('director')).toBe(true)
    expect(publicaDirecto('administracion')).toBe(true)
    expect(publicaDirecto('residente')).toBe(false)
  })
})

describe('aplicarFijado', () => {
  const base = () => armarFeed([pub('p2', T(2), { reacciones: ['u2'] }), pub('p1', T(1))])
  const DATOS = { fijadoEn: T(5), fijadoHasta: T(9), fijadoPor: 'dir' }

  it('fija y desfija una publicación sin tocar las demás', () => {
    const fijada = aplicarFijado(base(), 'p1', DATOS)
    expect(fijada[1]).toMatchObject({ id: 'p1', ...DATOS })
    expect(fijada[0]).toMatchObject({ id: 'p2', ...SIN_FIJAR, reacciones: ['u2'] })
    expect(aplicarFijado(fijada, 'p1', null)[1]).toMatchObject({ id: 'p1', ...SIN_FIJAR })
  })

  it('es idempotente: mismo estado o publicación desconocida devuelven el mismo arreglo', () => {
    const antes = base()
    expect(aplicarFijado(antes, 'p1', null)).toBe(antes)
    expect(aplicarFijado(antes, 'desconocida', DATOS)).toBe(antes)
    const fijada = aplicarFijado(antes, 'p1', DATOS)
    expect(aplicarFijado(fijada, 'p1', { ...DATOS })).toBe(fijada)
  })

  it('no modifica el estado recibido', () => {
    const antes = base()
    const copia = structuredClone(antes)
    aplicarFijado(antes, 'p1', DATOS)
    expect(antes).toEqual(copia)
  })
})
