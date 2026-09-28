import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PlanAgregadoAdministracion } from '@/app/(app)/comidas/_componentes/plan-agregado-administracion'
import { SemanaAgregadaAdministracion } from '@/app/(app)/comidas/_componentes/semana-agregada-administracion'
import { resumenComida, type ResumenComida } from '@/lib/comidas/resumen'
import { diasDeSemana } from '@/lib/comidas/semana'
import { TIEMPOS_COMIDA, type EstadoComida, type TiempoComida, type ValorEfectivo } from '@/lib/comidas/tipos'
import type { DiaAgregado } from '@/lib/comidas/vista'

function v(estado: EstadoComida, nota: string | null = null): ValorEfectivo {
  return { estado, nota, origen: 'persona' }
}

const VACIO: Record<TiempoComida, ResumenComida> = {
  desayuno: resumenComida([]),
  almuerzo: resumenComida([]),
  cena: resumenComida([]),
}

/** El contenido de la única celda que cumple con los atributos dados. */
function celda(markup: string, atributos: Record<string, string>): string {
  const celdas = [...markup.matchAll(/<td([^>]*)>([^]*?)<\/td>/g)].filter(([, attrs]) =>
    Object.entries(atributos).every(([nombre, valor]) => attrs.includes(`${nombre}="${valor}"`)),
  )
  expect(celdas).toHaveLength(1)
  return celdas[0][0]
}

describe('SemanaAgregadaAdministracion', () => {
  const LUNES = '2026-09-21'
  const dias: DiaAgregado[] = diasDeSemana(LUNES).map((fecha) => ({
    fecha,
    resumen:
      fecha === '2026-09-23'
        ? { ...VACIO, almuerzo: resumenComida([v('tarde', '13:30'), v('si'), v('bolsa'), null]) }
        : VACIO,
  }))
  const markup = renderToStaticMarkup(
    createElement(SemanaAgregadaAdministracion, { dias, extras: { '2026-09-23': { cena: 2 } } }),
  )

  it('una fila por día (con su fecha) y una columna por comida', () => {
    const encabezadosDeFila = [...markup.matchAll(/<th scope="row"[^>]*>([^<]*)<\/th>/g)].map(([, texto]) => texto)
    expect(encabezadosDeFila).toEqual([
      'Lunes 21/9',
      'Martes 22/9',
      'Miércoles 23/9',
      'Jueves 24/9',
      'Viernes 25/9',
      'Sábado 26/9',
      'Domingo 27/9',
    ])
    const columnas = [...markup.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(([, texto]) => texto)
    expect(columnas).toEqual(['Día', 'Desayuno', 'Almuerzo', 'Cena'])
    expect(markup.match(/<td /g)).toHaveLength(7 * TIEMPOS_COMIDA.length)
  })

  it('cada celda dice su fecha, su comida y la etiqueta para el teléfono, y trae el desglose', () => {
    const almuerzo = celda(markup, { 'data-fecha': '2026-09-23', 'data-comida': 'almuerzo', 'data-et': 'Almuerzo' })
    expect(almuerzo).toContain('<span class="conteo-numero">3</span>')
    expect(almuerzo).toContain('1 tarde (13:30)')
    expect(almuerzo).toContain('1 en bolsa')
    expect(almuerzo).toContain('1 sí')
    expect(almuerzo).toContain('1 sin definir')
  })

  it('los extras van en la celda de su día y comida', () => {
    expect(celda(markup, { 'data-fecha': '2026-09-23', 'data-comida': 'cena' })).toContain('+2 extra')
    expect(markup.match(/\+\d+ extra/g)).toEqual(['+2 extra'])
  })

  it('no hay filas ni encabezados por persona', () => {
    expect(markup).not.toContain('Persona')
  })
})

describe('PlanAgregadoAdministracion', () => {
  const resumenSemana: Record<number, Record<TiempoComida, ResumenComida>> = {}
  for (let dia = 1; dia <= 7; dia++) resumenSemana[dia] = VACIO
  resumenSemana[3] = { ...VACIO, almuerzo: resumenComida([v('temprano', '11:30'), v('no')]) }
  const markup = renderToStaticMarkup(createElement(PlanAgregadoAdministracion, { resumenSemana }))

  it('una fila por día de la semana y una columna por comida', () => {
    const encabezadosDeFila = [...markup.matchAll(/<th scope="row"[^>]*>([^<]*)<\/th>/g)].map(([, texto]) => texto)
    expect(encabezadosDeFila).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'])
    expect(markup.match(/<td /g)).toHaveLength(7 * TIEMPOS_COMIDA.length)
  })

  it('cada celda dice su día de semana y su comida, y trae el desglose', () => {
    const almuerzo = celda(markup, { 'data-dia': '3', 'data-comida': 'almuerzo', 'data-et': 'Almuerzo' })
    expect(almuerzo).toContain('<span class="conteo-numero">1</span>')
    expect(almuerzo).toContain('1 temprano (11:30)')
    expect(almuerzo).toContain('1 no come')
  })
})
