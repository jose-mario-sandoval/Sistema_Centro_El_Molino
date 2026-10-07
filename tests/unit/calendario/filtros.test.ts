import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import {
  alternarFiltro,
  atributoOcultos,
  CLAVE_FILTROS,
  avisoGuardado,
  crearAlmacenOcultos,
  escribirOcultos,
  eventosDelDia,
  filtroQueOculta,
  textoMostrarFiltro,
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

  it('un evento sin tipo nunca se filtra', () => {
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

  it('Administración: cuántos pedidos para la cocina y de qué categoría', () => {
    const pedido = evento('a', 'san_rafael', { requiere_cocina: ['merienda'] })
    const otroPedido = evento('b', 'san_gabriel', { requiere_cocina: ['comida'] })
    expect(etiquetaDiaCalendario({ ...base, visibles: [pedido], paraCocina: true })).toBe(
      `${dia}, 1 pedido para la cocina: San Rafael`,
    )
    expect(etiquetaDiaCalendario({ ...base, visibles: [pedido, otroPedido, pedido], paraCocina: true })).toBe(
      `${dia}, 3 pedidos para la cocina: San Rafael y San Gabriel`,
    )
  })
})

describe('atributoOcultos', () => {
  it('lo que va en html[data-cal-oculta]: claves separadas por espacio, o nada', () => {
    expect(atributoOcultos([])).toBeNull()
    expect(atributoOcultos(['san_miguel', 'ausencias'])).toBe('san_miguel ausencias')
  })
})

/** Corre el script previo al pintado con un localStorage y un <html> falsos: devuelve los atributos que puso. */
function atributosDelScript(guardado: string | null | (() => never)): Map<string, string> {
  const atributos = new Map<string, string>()
  const localStorage = {
    getItem: (clave: string) => {
      if (typeof guardado === 'function') return guardado()
      return clave === CLAVE_FILTROS ? guardado : null
    },
  }
  const document = { documentElement: { setAttribute: (n: string, v: string) => atributos.set(n, v) } }
  runInNewContext(SCRIPT_FILTROS_CALENDARIO, { localStorage, document })
  return atributos
}

/** Lo que el script dejó en html[data-cal-oculta], o null. */
function correrScript(guardado: string | null | (() => never)): string | null {
  return atributosDelScript(guardado).get('data-cal-oculta') ?? null
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

  it('también cuántos (hasta 3), para reservar el lugar del aviso antes de hidratar', () => {
    expect(atributosDelScript('{"ocultos":["san_miguel"]}').get('data-cal-oculta-n')).toBe('1')
    expect(atributosDelScript('{"ocultos":["san_miguel","ausencias"]}').get('data-cal-oculta-n')).toBe('2')
    expect(atributosDelScript(escribirOcultos([...FILTROS])).get('data-cal-oculta-n')).toBe('3')
    expect(atributosDelScript('{"ocultos":[]}').has('data-cal-oculta-n')).toBe(false)
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

  it('lo que otra pestaña guardó manda, aunque esta no la haya estado escuchando (el calendario no estaba abierto)', () => {
    const compartido = almacenFalso()
    const pestanaA = crearAlmacenOcultos(() => compartido)
    const pestanaB = crearAlmacenOcultos(() => compartido)
    pestanaA.guardar(escribirOcultos(['san_miguel']))
    // A se va a otra sección (nadie escucha "storage"); B toca "Mostrar todo".
    pestanaB.guardar(escribirOcultos([]))
    // A vuelve al calendario: lee lo último, y su próximo toque parte de ahí (no pisa lo de B).
    expect(leerOcultos(pestanaA.leer())).toEqual([])
    pestanaA.guardar(escribirOcultos(['otro']))
    expect(leerOcultos(compartido.getItem(CLAVE_FILTROS))).toEqual(['otro'])
  })

  it('al enterarse de un cambio de otra pestaña vuelve a leer el dispositivo y avisa', () => {
    const compartido = almacenFalso()
    const almacen = crearAlmacenOcultos(() => compartido)
    let avisos = 0
    almacen.suscribir(() => avisos++)
    compartido.setItem(CLAVE_FILTROS, '{"ocultos":["san_rafael"]}')
    almacen.desdeOtraPestana()
    expect(leerOcultos(almacen.leer())).toEqual(['san_rafael'])
    expect(avisos).toBe(1)
  })

  it('si guardar falló, lo recordado en memoria se olvida cuando otra pestaña cambia algo', () => {
    let lleno = true
    const compartido = almacenFalso()
    const almacen = crearAlmacenOcultos(() => ({
      getItem: compartido.getItem,
      setItem: (clave: string, valor: string) => {
        if (lleno) throw new Error('QuotaExceededError')
        compartido.setItem(clave, valor)
      },
    }))
    almacen.guardar(escribirOcultos(['otro']))
    expect(leerOcultos(almacen.leer())).toEqual(['otro'])
    lleno = false
    compartido.setItem(CLAVE_FILTROS, '{"ocultos":["san_gabriel"]}')
    almacen.desdeOtraPestana()
    expect(leerOcultos(almacen.leer())).toEqual(['san_gabriel'])
  })
})

describe('filtroQueOculta', () => {
  it('nada, si el evento se ve', () => {
    expect(filtroQueOculta(miguel, [])).toBeNull()
    expect(filtroQueOculta(rafael, ['san_miguel', 'sin_pedido'])).toBeNull()
  })

  it('su tipo, si está oculto (primero el tipo: es lo que la persona reconoce)', () => {
    expect(filtroQueOculta(gabriel, ['san_gabriel', 'sin_pedido'])).toBe('san_gabriel')
  })

  it('"sin pedido", si no pide nada y se ven solo los que piden', () => {
    expect(filtroQueOculta(otro, ['sin_pedido'])).toBe('sin_pedido')
  })

  it('un evento sin tipo, nunca', () => {
    expect(filtroQueOculta(evento('a', null), ['sin_pedido'])).toBeNull()
  })
})

describe('avisoGuardado', () => {
  it('si se ve, el aviso de siempre', () => {
    expect(avisoGuardado('Evento agregado.', miguel, [])).toBe('Evento agregado.')
  })

  it('si su tipo está oculto, dice por qué no aparece en el calendario', () => {
    expect(avisoGuardado('Evento agregado.', miguel, ['san_miguel'])).toBe(
      'Evento agregado. No se ve en el calendario porque «San Miguel» está oculto en los filtros.',
    )
  })

  it('una serie, en plural', () => {
    expect(avisoGuardado('Se crearon 5 eventos.', miguel, ['san_miguel'], { varios: true })).toBe(
      'Se crearon 5 eventos. No se ven en el calendario porque «San Miguel» está oculto en los filtros.',
    )
  })

  it('sin pedido con "Solo eventos con pedido a cocina"', () => {
    expect(avisoGuardado('Evento actualizado.', otro, ['sin_pedido'])).toBe(
      'Evento actualizado. No se ve en el calendario porque no pide nada a la cocina y estás viendo solo los eventos con pedido.',
    )
    expect(avisoGuardado('Se crearon 3 eventos.', otro, ['sin_pedido'], { varios: true })).toBe(
      'Se crearon 3 eventos. No se ven en el calendario porque no piden nada a la cocina y estás viendo solo los eventos con pedido.',
    )
  })
})

describe('textoMostrarFiltro', () => {
  it('lo que dice el botón que vuelve a mostrar lo que esconde un filtro', () => {
    expect(textoMostrarFiltro('san_miguel')).toBe('Mostrar San Miguel en el calendario')
    expect(textoMostrarFiltro('sin_pedido')).toBe('Mostrar en el calendario los eventos sin pedido')
    expect(textoMostrarFiltro('ausencias')).toBe('Mostrar Mis ausencias en el calendario')
  })
})

describe('eventosDelDia', () => {
  const todos = [rafael, gabriel, miguel, otro]

  it('lista lo que se ve y cuenta lo oculto', () => {
    expect(eventosDelDia(todos, ['san_miguel'], { verTodos: false, revelados: new Set() })).toEqual({
      lista: [rafael, gabriel, otro],
      ocultosSinMostrar: 1,
    })
  })

  it('"Mostrarlos": todo, en su orden', () => {
    expect(eventosDelDia(todos, ['san_miguel'], { verTodos: true, revelados: new Set() })).toEqual({
      lista: todos,
      ocultosSinMostrar: 0,
    })
  })

  it('lo que se acaba de agregar o editar se lista aunque los filtros lo escondan (si no, parece que no se guardó)', () => {
    expect(eventosDelDia(todos, ['san_miguel', 'san_gabriel'], { verTodos: false, revelados: new Set(['m']) })).toEqual({
      lista: [rafael, miguel, otro],
      ocultosSinMostrar: 1,
    })
  })
})
