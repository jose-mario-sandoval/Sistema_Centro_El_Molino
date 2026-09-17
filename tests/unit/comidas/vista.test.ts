import { describe, expect, it } from 'vitest'
import { textoResumen } from '@/lib/comidas/resumen'
import { HORAS_LIMITE_POR_DEFECTO } from '@/lib/comidas/tipos'
import {
  armarDiaAdministracion,
  armarSemanaPersona,
  planDesdeFilas,
  valorTrasGuardar,
  type FilaPlan,
} from '@/lib/comidas/vista'

const AHORA = new Date('2026-09-16T08:00:00-06:00')
const horas = HORAS_LIMITE_POR_DEFECTO

const FILAS_PLAN: FilaPlan[] = [
  { dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null },
  { dia_semana: 3, comida: 'cena', estado: 'temprano', nota: '19:00' },
  { dia_semana: 1, comida: 'cena', estado: 'no', nota: null },
]

describe('planDesdeFilas', () => {
  it('agrupa por día de la semana y comida', () => {
    expect(planDesdeFilas(FILAS_PLAN)).toEqual({
      1: { cena: { estado: 'no', nota: null } },
      3: { almuerzo: { estado: 'si', nota: null }, cena: { estado: 'temprano', nota: '19:00' } },
    })
  })
})

describe('armarSemanaPersona', () => {
  const base = { lunes: '2026-09-14', ahora: AHORA, horas, plan: planDesdeFilas(FILAS_PLAN), selecciones: [], cerradas: [] }

  it('devuelve los 7 días con etiquetas y marca solo hoy', () => {
    const dias = armarSemanaPersona(base)
    expect(dias.map((d) => d.fecha)).toEqual([
      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20',
    ])
    expect(dias[2]).toMatchObject({ nombre: 'Miércoles', fechaCorta: '16/9', esHoy: true })
    expect(dias.filter((d) => d.esHoy)).toHaveLength(1)
  })

  it('combina plan, selección y estado de cierre de cada comida', () => {
    const dias = armarSemanaPersona({
      ...base,
      selecciones: [{ fecha: '2026-09-16', comida: 'cena', estado: 'tarde', nota: '20:00', origen: 'persona' }],
    })
    expect(dias[2].comidas).toEqual([
      { comida: 'desayuno', valor: null, plan: null, abierta: false, cierre: 'cerrada' },
      {
        comida: 'almuerzo',
        valor: { estado: 'si', nota: null, origen: 'plan' },
        plan: { estado: 'si', nota: null },
        abierta: true,
        cierre: 'cierra hoy 10:00',
      },
      {
        comida: 'cena',
        valor: { estado: 'tarde', nota: '20:00', origen: 'persona' },
        plan: { estado: 'temprano', nota: '19:00' },
        abierta: true,
        cierre: 'cierra hoy 16:00',
      },
    ])
  })

  it('una comida cerrada sin selección queda sin definir; con selección congelada la conserva', () => {
    const dias = armarSemanaPersona({
      ...base,
      selecciones: [{ fecha: '2026-09-14', comida: 'almuerzo', estado: 'no', nota: null, origen: 'plan' }],
      cerradas: [
        { fecha: '2026-09-14', comida: 'almuerzo' },
        { fecha: '2026-09-14', comida: 'cena' },
      ],
    })
    expect(dias[0].comidas[1]).toMatchObject({ valor: { estado: 'no', nota: null, origen: 'plan' }, abierta: false })
    expect(dias[0].comidas[2]).toEqual({
      comida: 'cena',
      valor: null,
      plan: { estado: 'no', nota: null },
      abierta: false,
      cierre: 'cerrada',
    })
  })
})

describe('armarDiaAdministracion', () => {
  const datos = armarDiaAdministracion({
    fecha: '2026-09-16',
    personas: [
      { id: 'a', nombre: 'Ana' },
      { id: 'b', nombre: 'Beto' },
      { id: 'c', nombre: 'Carla' },
    ],
    planes: [
      { usuario_id: 'a', dia_semana: 3, comida: 'desayuno', estado: 'si', nota: null },
      { usuario_id: 'a', dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null },
      { usuario_id: 'a', dia_semana: 4, comida: 'cena', estado: 'no', nota: null },
      { usuario_id: 'b', dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null },
    ],
    selecciones: [
      { usuario_id: 'b', fecha: '2026-09-16', comida: 'almuerzo', estado: 'tarde', nota: '13:30', origen: 'persona' },
      { usuario_id: 'c', fecha: '2026-09-17', comida: 'almuerzo', estado: 'no', nota: null, origen: 'persona' },
    ],
    cerradas: [{ fecha: '2026-09-16', comida: 'desayuno' }],
  })

  it('calcula el valor efectivo de cada persona en el orden recibido', () => {
    expect(datos.filas.map((f) => f.nombre)).toEqual(['Ana', 'Beto', 'Carla'])
    expect(datos.filas[0].valores).toEqual({ desayuno: null, almuerzo: { estado: 'si', nota: null, origen: 'plan' }, cena: null })
    expect(datos.filas[1].valores.almuerzo).toEqual({ estado: 'tarde', nota: '13:30', origen: 'persona' })
    expect(datos.filas[2].valores).toEqual({ desayuno: null, almuerzo: null, cena: null })
  })

  it('resume cada comida', () => {
    expect(textoResumen(datos.resumen.desayuno)).toBe('3 sin definir')
    expect(textoResumen(datos.resumen.almuerzo)).toBe('1 sí · 1 tarde (13:30) · 1 sin definir')
    expect(datos.resumen.cena.total).toBe(3)
  })
})

describe('valorTrasGuardar', () => {
  it('igual al plan queda como "según tu plan"', () => {
    expect(valorTrasGuardar({ estado: 'si', nota: null }, { estado: 'si', nota: null })).toEqual({ estado: 'si', nota: null, origen: 'plan' })
  })

  it('distinta nota o sin plan queda como cambio de la persona', () => {
    expect(valorTrasGuardar({ estado: 'tarde', nota: '13:30' }, { estado: 'tarde', nota: '14:00' }).origen).toBe('persona')
    expect(valorTrasGuardar(null, { estado: 'no', nota: null }).origen).toBe('persona')
  })
})
