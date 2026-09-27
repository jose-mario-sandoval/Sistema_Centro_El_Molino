import { describe, expect, it } from 'vitest'
import { estaAusente } from '@/lib/ausencias/tipos'
import { HORAS_LIMITE_POR_DEFECTO, TIEMPOS_COMIDA } from '@/lib/comidas/tipos'
import {
  agruparPorEstado,
  armarDiaAdministracion,
  armarSemanaDeLaCasa,
  armarSemanaPersona,
  diaCambiadoPorOtro,
  etiquetaTarjeta,
  planDesdeFilas,
  valorTrasGuardar,
  type PersonaEnComida,
} from '@/lib/comidas/vista'

/*
 * "La casa" del Director: la semana de todas las personas, pivotada por día y comida, con los
 * nombres reales (el Director los ve) y el mismo resumen que calcula Administración.
 */

const AHORA = new Date('2026-09-16T08:00:00-06:00') // miércoles 16/9, 08:00
const horas = HORAS_LIMITE_POR_DEFECTO
const LUNES = '2026-09-14'

const PERSONAS = [
  { id: 'a', nombre: 'Ana' },
  { id: 'b', nombre: 'Beto' },
  { id: 'c', nombre: 'Carla' },
]
const PLANES = [
  { usuario_id: 'a', dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null },
  { usuario_id: 'a', dia_semana: 3, comida: 'cena', estado: 'temprano', nota: '19:00' },
  { usuario_id: 'a', dia_semana: 4, comida: 'almuerzo', estado: 'si', nota: null },
  { usuario_id: 'b', dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null, modificado_por: 'dir' },
] as const
const SELECCIONES = [
  { usuario_id: 'b', fecha: '2026-09-16', comida: 'almuerzo', estado: 'tarde', nota: '13:30', origen: 'persona', modificado_por: 'dir' },
  { usuario_id: 'c', fecha: '2026-09-17', comida: 'almuerzo', estado: 'no', nota: null, origen: 'persona', modificado_por: null },
  { usuario_id: 'a', fecha: '2026-09-14', comida: 'almuerzo', estado: 'si', nota: null, origen: 'plan' },
] as const
const CERRADAS = [
  { fecha: '2026-09-14', comida: 'almuerzo' },
  { fecha: '2026-09-14', comida: 'cena' },
  { fecha: '2026-09-15', comida: 'desayuno' },
  { fecha: '2026-09-15', comida: 'almuerzo' },
  { fecha: '2026-09-15', comida: 'cena' },
  { fecha: '2026-09-16', comida: 'desayuno' },
] as const
const AUSENCIAS = [{ usuario_id: 'a', desde: '2026-09-17', hasta: '2026-09-18' }]

const datos = {
  lunes: LUNES,
  ahora: AHORA,
  horas,
  personas: PERSONAS,
  planes: [...PLANES],
  selecciones: [...SELECCIONES],
  cerradas: [...CERRADAS],
  ausencias: AUSENCIAS,
}

describe('armarSemanaDeLaCasa', () => {
  const casa = armarSemanaDeLaCasa(datos)

  it('devuelve los 7 días con sus tres comidas, y marca hoy', () => {
    expect(casa.map((d) => d.fecha)).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
    ])
    expect(casa[2]).toMatchObject({ nombre: 'Miércoles', fechaCorta: '16/9', esHoy: true })
    expect(casa.filter((d) => d.esHoy)).toHaveLength(1)
    for (const dia of casa) expect(dia.comidas.map((c) => c.comida)).toEqual([...TIEMPOS_COMIDA])
  })

  it('cada comida lleva a todas las personas, en el orden recibido y con su nombre', () => {
    for (const dia of casa) {
      for (const comida of dia.comidas) expect(comida.personas.map((p) => p.nombre)).toEqual(['Ana', 'Beto', 'Carla'])
    }
  })

  it('lo de cada persona es exactamente lo que ve ella en su Semana', () => {
    for (const persona of PERSONAS) {
      const suya = armarSemanaPersona({
        lunes: LUNES,
        ahora: AHORA,
        horas,
        plan: planDesdeFilas(PLANES.filter((f) => f.usuario_id === persona.id)),
        selecciones: SELECCIONES.filter((f) => f.usuario_id === persona.id),
        cerradas: [...CERRADAS],
        ausencias: AUSENCIAS.filter((a) => a.usuario_id === persona.id),
      })
      casa.forEach((dia, i) =>
        dia.comidas.forEach((comida, j) => {
          expect(comida.personas.find((p) => p.id === persona.id)?.datos).toEqual(suya[i].comidas[j])
        }),
      )
    }
  })

  it('abierta y cierre son de la comida, iguales para todas las personas', () => {
    expect(casa[2].comidas[0]).toMatchObject({ abierta: false, cierre: 'cerrada' })
    expect(casa[2].comidas[1]).toMatchObject({ abierta: true, cierre: 'cierra hoy 10:00' })
    expect(casa[0].comidas[1]).toMatchObject({ abierta: false, cierre: 'cerrada' })
  })

  it('sinCerrar (para los extras) sigue a la hora límite y al cierre del job, no a la ventana editable', () => {
    expect(casa[2].comidas[0].sinCerrar).toBe(false) // desayuno de hoy: cerró anoche
    expect(casa[2].comidas[1].sinCerrar).toBe(true)
    expect(casa[1].comidas[2].sinCerrar).toBe(false)
    const lejana = armarSemanaDeLaCasa({ ...datos, lunes: '2026-10-19', cerradas: [] })
    expect(lejana[0].comidas[0]).toMatchObject({ abierta: false, sinCerrar: true })
  })

  it('las ausencias son de cada persona', () => {
    const [ana, beto, carla] = casa[3].comidas[1].personas
    expect(ana.datos).toMatchObject({ ausente: true, valor: { estado: 'no', origen: 'ausencia' } })
    expect(beto.datos).toMatchObject({ ausente: false, valor: null })
    expect(carla.datos).toMatchObject({ ausente: false, valor: { estado: 'no', origen: 'persona' } })
  })

  it('marca la comida que cambió otra persona (el Director)', () => {
    const beto = casa[2].comidas[1].personas[1]
    expect(beto.datos.valor).toEqual({ estado: 'tarde', nota: '13:30', origen: 'persona', cambiadaPorOtro: true })
    const carla = casa[3].comidas[1].personas[2]
    expect(carla.datos.valor).not.toHaveProperty('cambiadaPorOtro')
  })

  it('el resumen de cada comida es el mismo que calcula Administración', () => {
    for (const dia of casa) {
      const administracion = armarDiaAdministracion({
        fecha: dia.fecha,
        personas: PERSONAS,
        planes: [...PLANES],
        selecciones: [...SELECCIONES],
        cerradas: [...CERRADAS],
        ausentes: PERSONAS.filter((p) => estaAusente(AUSENCIAS.filter((a) => a.usuario_id === p.id), dia.fecha)).map((p) => p.id),
      })
      for (const comida of dia.comidas) expect(comida.resumen, `${dia.fecha} ${comida.comida}`).toEqual(administracion.resumen[comida.comida])
    }
  })

  it('sin personas, igual arma la semana: comidas vacías con su cierre', () => {
    const vacia = armarSemanaDeLaCasa({ ...datos, personas: [] })
    expect(vacia).toHaveLength(7)
    expect(vacia[2].comidas[1]).toEqual({
      comida: 'almuerzo',
      resumen: { total: 0, partes: [] },
      abierta: true,
      sinCerrar: true,
      cierre: 'cierra hoy 10:00',
      personas: [],
    })
  })
})

describe('agruparPorEstado: las personas de una comida, por lo que eligieron', () => {
  const casa = armarSemanaDeLaCasa({
    ...datos,
    personas: [...PERSONAS, { id: 'd', nombre: 'Dora' }],
    selecciones: [
      ...SELECCIONES,
      { usuario_id: 'd', fecha: '2026-09-16', comida: 'almuerzo', estado: 'no', nota: null, origen: 'persona' },
    ],
  })
  // Miércoles 16, almuerzo: Ana sí (plan), Beto tarde, Carla sin definir, Dora no.
  const personas: PersonaEnComida[] = casa[2].comidas[1].personas

  it('"Sin definir" va primero; después, en el orden de la cocina; solo grupos con personas', () => {
    expect(agruparPorEstado(personas).map((g) => [g.clave, g.etiqueta, g.personas.map((p) => p.nombre)])).toEqual([
      ['sin_definir', 'Sin definir', ['Carla']],
      ['tarde', 'Comer tarde', ['Beto']],
      ['si', 'Sí comer', ['Ana']],
      ['no', 'No comer', ['Dora']],
    ])
  })

  it('dentro de un grupo conserva el orden recibido', () => {
    const todosSinDefinir = casa[6].comidas[0].personas
    expect(agruparPorEstado(todosSinDefinir)).toEqual([
      { clave: 'sin_definir', etiqueta: 'Sin definir', personas: todosSinDefinir },
    ])
  })

  it('sin personas, sin grupos', () => {
    expect(agruparPorEstado([])).toEqual([])
  })
})

describe('quién cambió: modificado_por → cambiadaPorOtro', () => {
  it('armarSemanaPersona marca la selección que cambió otra persona y no agrega nada si fue la propia', () => {
    const dias = armarSemanaPersona({
      lunes: LUNES,
      ahora: AHORA,
      horas,
      plan: {},
      selecciones: [
        { fecha: '2026-09-17', comida: 'almuerzo', estado: 'no', nota: null, origen: 'persona', modificado_por: 'dir' },
        { fecha: '2026-09-17', comida: 'cena', estado: 'no', nota: null, origen: 'persona', modificado_por: null },
      ],
      cerradas: [],
    })
    expect(dias[3].comidas[1].valor).toEqual({ estado: 'no', nota: null, origen: 'persona', cambiadaPorOtro: true })
    expect(dias[3].comidas[2].valor).toEqual({ estado: 'no', nota: null, origen: 'persona' })
    expect(dias[3].comidas[2].valor).not.toHaveProperty('cambiadaPorOtro')
  })

  it('planDesdeFilas marca la celda del plan que cambió otra persona', () => {
    expect(
      planDesdeFilas([
        { dia_semana: 1, comida: 'cena', estado: 'no', nota: null, modificado_por: 'dir' },
        { dia_semana: 2, comida: 'cena', estado: 'si', nota: null, modificado_por: null },
        { dia_semana: 3, comida: 'cena', estado: 'si', nota: null },
      ]),
    ).toEqual({
      1: { cena: { estado: 'no', nota: null, cambiadaPorOtro: true } },
      2: { cena: { estado: 'si', nota: null } },
      3: { cena: { estado: 'si', nota: null } },
    })
  })

  it('el plan cambiado por otro no convierte al valor "según tu plan" en "la cambió el Director"', () => {
    const dias = armarSemanaPersona({
      lunes: LUNES,
      ahora: AHORA,
      horas,
      plan: planDesdeFilas([{ dia_semana: 4, comida: 'almuerzo', estado: 'si', nota: null, modificado_por: 'dir' }]),
      selecciones: [],
      cerradas: [],
    })
    expect(dias[3].comidas[1].valor).toEqual({ estado: 'si', nota: null, origen: 'plan' })
  })
})

describe('la persona ve de un vistazo lo que cambió el Director', () => {
  const dias = armarSemanaPersona({
    lunes: LUNES,
    ahora: AHORA,
    horas,
    plan: {},
    selecciones: [{ fecha: '2026-09-17', comida: 'almuerzo', estado: 'no', nota: null, origen: 'persona', modificado_por: 'dir' }],
    cerradas: [],
  })

  it('diaCambiadoPorOtro: el día con alguna comida que cambió el Director', () => {
    expect(dias.map(diaCambiadoPorOtro)).toEqual([false, false, false, true, false, false, false])
  })

  it('etiquetaTarjeta lo dice en la comida que cambió', () => {
    expect(etiquetaTarjeta(dias[3])).toBe(
      'Jueves 17/9, cambió el Director. Desayuno: Falta, sin definir. Almuerzo: No comer, la cambió el Director. Cena: Falta, sin definir.',
    )
  })
})

describe('valorTrasGuardar: cuando guarda otra persona (el Director)', () => {
  it('una excepción queda marcada como cambiada por otro', () => {
    expect(valorTrasGuardar({ estado: 'si', nota: null }, { estado: 'no', nota: null }, false, true)).toEqual({
      estado: 'no',
      nota: null,
      origen: 'persona',
      cambiadaPorOtro: true,
    })
  })

  it('si coincide con la referencia no hay excepción, ni marca', () => {
    expect(valorTrasGuardar({ estado: 'si', nota: null }, { estado: 'si', nota: null }, false, true)).toEqual({
      estado: 'si',
      nota: null,
      origen: 'plan',
    })
    expect(valorTrasGuardar(null, { estado: 'no', nota: null }, true, true)).toEqual({ estado: 'no', nota: null, origen: 'ausencia' })
  })

  it('sin indicarlo, como siempre: sin marca', () => {
    expect(valorTrasGuardar(null, { estado: 'no', nota: null })).toEqual({ estado: 'no', nota: null, origen: 'persona' })
  })
})
