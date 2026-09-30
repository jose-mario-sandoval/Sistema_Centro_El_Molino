import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  alternarFiltro,
  atributoOcultos,
  CLAVE_FILTROS,
  crearAlmacenOcultos,
  escribirOcultos,
  etiquetaDiaCalendario,
  eventoVisible,
  FILTROS,
  filtrarEventos,
  leerOcultos,
  SCRIPT_FILTROS_CALENDARIO,
  textoCantidadOcultos,
  textoOcultos,
  type Filtro,
} from '@/lib/calendario/filtros'
import type { Evento, TipoEvento } from '@/lib/calendario/tipos'

function evento(id: string, tipo: TipoEvento | null, pedido: Partial<Pick<Evento, 'requiere_cocina' | 'requiere_otro_texto'>> = {}): Evento {
  return {
    id,
    titulo: `Evento ${id}`,
    fecha: '2026-10-07',
    hora: null,
    tipo,
    requiere_cocina: [],
    requiere_otro_texto: null,
    serie_id: null,
    ...pedido,
  }
}

const rafael = evento('r', 'san_rafael', { requiere_cocina: ['merienda'] })
const gabriel = evento('g', 'san_gabriel')
const miguel = evento('m', 'san_miguel', { requiere_otro_texto: '20 sillas extra' })
const otro = evento('o', 'otro')

describe('leerOcultos', () => {
  it('sin nada guardado no se oculta nada: el calendario muestra todo', () => {
    expect(leerOcultos(null)).toEqual([])
  })

  it('lee lo guardado', () => {
    expect(leerOcultos('{"ocultos":["san_miguel","ausencias"]}')).toEqual(['san_miguel', 'ausencias'])
  })

  it('siempre en el mismo orden y sin repetidos, sin importar cómo se guardó', () => {
    expect(leerOcultos('{"ocultos":["sin_pedido","otro","san_rafael","otro"]}')).toEqual(['san_rafael', 'otro', 'sin_pedido'])
  })

  it('descarta lo que no reconoce y conserva lo válido', () => {
    expect(leerOcultos('{"ocultos":["retiro","san_gabriel",42,null,{"x":1}]}')).toEqual(['san_gabriel'])
  })

  it.each([[''], ['no es json'], ['null'], ['"texto"'], ['[1,2]'], ['{}'], ['{"ocultos":"san_miguel"}'], ['{"ocultos":null}']])(
    'con %j (roto o de otra versión) vuelve a mostrar todo',
    (texto) => {
      expect(leerOcultos(texto)).toEqual([])
    },
  )
})

describe('escribirOcultos', () => {
  it('guarda en orden y sin repetidos, y se vuelve a leer igual', () => {
    const texto = escribirOcultos(['ausencias', 'san_miguel', 'san_miguel'])
    expect(texto).toBe('{"ocultos":["san_miguel","ausencias"]}')
    expect(leerOcultos(texto)).toEqual(['san_miguel', 'ausencias'])
  })
})

describe('alternarFiltro', () => {
  it('oculta y vuelve a mostrar', () => {
    expect(alternarFiltro([], 'san_miguel')).toEqual(['san_miguel'])
    expect(alternarFiltro(['san_miguel'], 'san_miguel')).toEqual([])
  })

  it('se combinan, en el orden de los chips', () => {
    expect(alternarFiltro(['sin_pedido'], 'san_rafael')).toEqual(['san_rafael', 'sin_pedido'])
  })

  it('no modifica la lista original', () => {
    const original: Filtro[] = ['otro']
    alternarFiltro(original, 'san_gabriel')
    expect(original).toEqual(['otro'])
  })
})

describe('eventoVisible', () => {
  it('sin filtros, todo se ve', () => {
    for (const e of [rafael, gabriel, miguel, otro]) expect(eventoVisible(e, [])).toBe(true)
  })

  it('un tipo oculto esconde solo los de ese tipo', () => {
    expect(eventoVisible(miguel, ['san_miguel'])).toBe(false)
    expect(eventoVisible(gabriel, ['san_miguel'])).toBe(true)
  })

  it('"Solo eventos con pedido a cocina" esconde los que no piden nada (ni lista ni texto libre)', () => {
    expect(eventoVisible(rafael, ['sin_pedido'])).toBe(true)
    expect(eventoVisible(miguel, ['sin_pedido'])).toBe(true)
    expect(eventoVisible(gabriel, ['sin_pedido'])).toBe(false)
    expect(eventoVisible(otro, ['sin_pedido'])).toBe(false)
  })

  it('combinados: el tipo tiene que estar a la vista y, con "solo cocina", pedir algo', () => {
    expect(eventoVisible(rafael, ['san_rafael', 'sin_pedido'])).toBe(false)
    expect(eventoVisible(miguel, ['san_rafael', 'sin_pedido'])).toBe(true)
  })

  it('ocultar "Mis ausencias" no esconde ningún evento', () => {
    for (const e of [rafael, gabriel, miguel, otro]) expect(eventoVisible(e, ['ausencias'])).toBe(true)
  })

  it('un evento sin tipo (el de Administración) nunca se filtra', () => {
    expect(eventoVisible(evento('a', null, { requiere_cocina: ['comida'] }), ['san_rafael', 'san_gabriel', 'san_miguel', 'otro'])).toBe(true)
  })
})

describe('filtrarEventos', () => {
  it('separa lo que se ve y cuenta lo oculto, conservando el orden', () => {
    expect(filtrarEventos([rafael, gabriel, miguel, otro], ['san_gabriel', 'otro'])).toEqual({ visibles: [rafael, miguel], ocultos: 2 })
  })

  it('sin filtros devuelve la misma lista y cero ocultos', () => {
    const lista = [rafael, otro]
    expect(filtrarEventos(lista, [])).toEqual({ visibles: lista, ocultos: 0 })
  })

  it('todo oculto', () => {
    expect(filtrarEventos([gabriel, otro], ['sin_pedido'])).toEqual({ visibles: [], ocultos: 2 })
  })
})

describe('textoOcultos', () => {
  it('sin nada oculto no hay aviso', () => {
    expect(textoOcultos([])).toBeNull()
  })

  it('uno', () => {
    expect(textoOcultos(['san_miguel'])).toBe('Estás ocultando: San Miguel.')
  })

  it('dos, con "y"', () => {
    expect(textoOcultos(['san_miguel', 'ausencias'])).toBe('Estás ocultando: San Miguel y Mis ausencias.')
  })

  it('varios, con comas y "y" antes del último; "solo cocina" dicho como lo que esconde', () => {
    expect(textoOcultos(['san_rafael', 'otro', 'ausencias', 'sin_pedido'])).toBe(
      'Estás ocultando: San Rafael, Otro, Mis ausencias y los eventos sin pedido a cocina.',
    )
  })
})

describe('textoCantidadOcultos', () => {
  it('singular y plural', () => {
    expect(textoCantidadOcultos(1)).toBe('1 evento oculto por los filtros')
    expect(textoCantidadOcultos(3)).toBe('3 eventos ocultos por los filtros')
  })
})

describe('etiquetaDiaCalendario', () => {
  const dia = 'Miércoles, 7 de octubre de 2026'
  const base = { etiqueta: dia, visibles: [] as Evento[], ocultos: 0, paraCocina: false, ausente: false }

  it('un día vacío dice solo la fecha', () => {
    expect(etiquetaDiaCalendario(base)).toBe(dia)
  })

  it('dice cuántos eventos y de qué tipo, sin repetir el tipo', () => {
    expect(etiquetaDiaCalendario({ ...base, visibles: [miguel] })).toBe(`${dia}, 1 evento: San Miguel`)
    expect(etiquetaDiaCalendario({ ...base, visibles: [miguel, otro, evento('m2', 'san_miguel')] })).toBe(
      `${dia}, 3 eventos: San Miguel y Otro`,
    )
  })

  it('cuenta lo oculto por los filtros, para que el día no parezca vacío', () => {
    expect(etiquetaDiaCalendario({ ...base, visibles: [rafael], ocultos: 2 })).toBe(
      `${dia}, 1 evento: San Rafael, 2 ocultos por los filtros`,
    )
    expect(etiquetaDiaCalendario({ ...base, ocultos: 1 })).toBe(`${dia}, 1 oculto por los filtros`)
  })

  it('la ausencia, al final', () => {
    expect(etiquetaDiaCalendario({ ...base, ausente: true })).toBe(`${dia}, ausente`)
    expect(etiquetaDiaCalendario({ ...base, visibles: [otro], ausente: true })).toBe(`${dia}, 1 evento: Otro, ausente`)
  })

  it('Administración: pedidos para la cocina, sin tipos (nunca los conoce)', () => {
    const pedido = evento('a', null, { requiere_cocina: ['merienda'] })
    expect(etiquetaDiaCalendario({ ...base, visibles: [pedido], paraCocina: true })).toBe(`${dia}, 1 pedido para la cocina`)
    expect(etiquetaDiaCalendario({ ...base, visibles: [pedido, pedido], paraCocina: true })).toBe(`${dia}, 2 pedidos para la cocina`)
  })
})

describe('atributoOcultos', () => {
  it('lo que va en html[data-cal-oculta]: claves separadas por espacio, o nada', () => {
    expect(atributoOcultos([])).toBeNull()
    expect(atributoOcultos(['san_miguel', 'ausencias'])).toBe('san_miguel ausencias')
  })
})

/** Corre el script previo al pintado con un localStorage y un <html> falsos. */
function correrScript(guardado: string | null | (() => never)): string | null {
  const atributos = new Map<string, string>()
  const localStorage = {
    getItem: (clave: string) => {
      if (typeof guardado === 'function') return guardado()
      return clave === CLAVE_FILTROS ? guardado : null
    },
  }
  const document = { documentElement: { setAttribute: (n: string, v: string) => atributos.set(n, v) } }
  runInNewContext(SCRIPT_FILTROS_CALENDARIO, { localStorage, document })
  return atributos.get('data-cal-oculta') ?? null
}

describe('SCRIPT_FILTROS_CALENDARIO', () => {
  const casos: (string | null)[] = [
    null,
    '',
    'no es json',
    'null',
    '[]',
    '{}',
    '{"ocultos":"san_miguel"}',
    '{"ocultos":["san_miguel"]}',
    '{"ocultos":["ausencias","sin_pedido","otro"]}',
    '{"ocultos":["san_rafael","san_rafael",7,null]}',
    escribirOcultos([...FILTROS]),
  ]

  it.each(casos)('con %j pinta lo mismo que leerOcultos', (guardado) => {
    const delScript = correrScript(guardado)
    const conocidas = (delScript ?? '').split(' ').filter((c) => (FILTROS as readonly string[]).includes(c))
    expect(new Set(conocidas)).toEqual(new Set(leerOcultos(guardado)))
    if (leerOcultos(guardado).length === 0) expect(delScript).toBeNull()
  })

  it('si el almacenamiento está bloqueado no rompe la página', () => {
    expect(
      correrScript(() => {
        throw new Error('SecurityError')
      }),
    ).toBeNull()
  })

  it('solo copia claves simples: nada de lo guardado puede meter comillas ni otra cosa en el atributo', () => {
    expect(correrScript('{"ocultos":["san_miguel\\" onload=\\"x","ok"]}')).toBe('ok')
  })

  it('no nombra categorías ni ausencias: va en el HTML de todas las páginas, también en las de Administración', () => {
    expect(SCRIPT_FILTROS_CALENDARIO).not.toMatch(/ausen|rafael|gabriel|miguel|otro/i)
  })
})

describe('crearAlmacenOcultos', () => {
  function almacenFalso(inicial: Record<string, string> = {}) {
    const datos = new Map(Object.entries(inicial))
    return {
      datos,
      getItem: (clave: string) => datos.get(clave) ?? null,
      setItem: (clave: string, valor: string) => void datos.set(clave, valor),
    }
  }
  const bloqueado = {
    getItem: (): string | null => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  }

  it('lee lo guardado en el dispositivo', () => {
    const almacen = crearAlmacenOcultos(() => almacenFalso({ [CLAVE_FILTROS]: '{"ocultos":["otro"]}' }))
    expect(leerOcultos(almacen.leer())).toEqual(['otro'])
  })

  it('sin nada guardado: todo a la vista', () => {
    const almacen = crearAlmacenOcultos(() => almacenFalso())
    expect(leerOcultos(almacen.leer())).toEqual([])
  })

  it('guarda, avisa a quien escucha y lo vuelve a leer', () => {
    const falso = almacenFalso()
    const almacen = crearAlmacenOcultos(() => falso)
    let avisos = 0
    const dejar = almacen.suscribir(() => avisos++)
    almacen.guardar(escribirOcultos(['san_miguel']))
    expect(falso.datos.get(CLAVE_FILTROS)).toBe('{"ocultos":["san_miguel"]}')
    expect(leerOcultos(almacen.leer())).toEqual(['san_miguel'])
    expect(avisos).toBe(1)
    dejar()
    almacen.guardar(escribirOcultos([]))
    expect(avisos).toBe(1)
  })

  it('con el almacenamiento bloqueado no rompe: arranca mostrando todo y recuerda lo elegido en esta visita', () => {
    const almacen = crearAlmacenOcultos(() => bloqueado)
    expect(leerOcultos(almacen.leer())).toEqual([])
    expect(() => almacen.guardar(escribirOcultos(['ausencias']))).not.toThrow()
    expect(leerOcultos(almacen.leer())).toEqual(['ausencias'])
  })

  it('sin localStorage (el navegador no lo ofrece) tampoco rompe', () => {
    const almacen = crearAlmacenOcultos(() => {
      throw new ReferenceError('localStorage is not defined')
    })
    expect(almacen.leer()).toBe('')
    expect(() => almacen.guardar('{"ocultos":["otro"]}')).not.toThrow()
    expect(leerOcultos(almacen.leer())).toEqual(['otro'])
  })

  it('lo que cambió en otra pestaña manda sobre lo recordado en esta', () => {
    const almacen = crearAlmacenOcultos(() => bloqueado)
    almacen.guardar(escribirOcultos(['otro']))
    let avisos = 0
    almacen.suscribir(() => avisos++)
    almacen.desdeOtraPestana('{"ocultos":["san_rafael"]}')
    expect(leerOcultos(almacen.leer())).toEqual(['san_rafael'])
    almacen.desdeOtraPestana(null)
    expect(leerOcultos(almacen.leer())).toEqual([])
    expect(avisos).toBe(2)
  })
})
