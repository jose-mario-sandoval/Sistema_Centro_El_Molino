import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CeldaResumen } from '@/app/(app)/comidas/_componentes/celda-resumen'
import { resumenComida } from '@/lib/comidas/resumen'
import type { EstadoComida, ValorEfectivo } from '@/lib/comidas/tipos'

function v(estado: EstadoComida, nota: string | null = null): ValorEfectivo {
  return { estado, nota, origen: 'plan' }
}

function html(props: ComponentProps<typeof CeldaResumen>): string {
  return renderToStaticMarkup(createElement(CeldaResumen, props))
}

describe('CeldaResumen', () => {
  const resumen = resumenComida([v('si'), v('si'), v('no'), null, v('tarde', '13:30'), v('temprano', '06:30')])

  it('el número de los que comen va solo en .conteo-numero, con la palabra al lado', () => {
    const markup = html({ resumen })
    expect(markup).toContain('<span class="conteo-numero">4</span>')
    expect(markup).toContain('<span class="conteo-etiqueta">comen</span>')
  })

  it('en singular dice "come"', () => {
    expect(html({ resumen: resumenComida([v('si'), v('no')]) })).toContain('<span class="conteo-etiqueta">come</span>')
  })

  it('lista las partes en el orden de la cocina, cada una con icono, texto y sus colores', () => {
    const markup = html({ resumen })
    const orden = ['1 temprano (06:30)', '1 tarde (13:30)', '2 sí', '1 no come', '1 sin definir'].map((texto) =>
      markup.indexOf(texto),
    )
    expect(orden.every((posicion) => posicion > 0)).toBe(true)
    expect(orden).toEqual([...orden].sort((a, b) => a - b))
    expect(markup).toContain('<ul class="partes">')
    expect(markup).toMatch(/<li class="parte" style="--c:var\(--st-temprano\);--cbg:var\(--st-temprano-bg\)"><svg class="icono"/)
    expect(markup.match(/<svg class="icono"/g)).toHaveLength(5)
  })

  it('"sin definir" se distingue por su clase, no por los colores de un estado', () => {
    expect(html({ resumen })).toMatch(/<li class="parte sin-definir"><svg class="icono"[^]*?<\/svg>1 sin definir<\/li>/)
  })

  it('sin personas muestra 0 y ninguna parte', () => {
    const markup = html({ resumen: resumenComida([]) })
    expect(markup).toContain('<span class="conteo-numero">0</span>')
    expect(markup).not.toContain('class="partes"')
  })

  it('nunca muestra la nota de "enfermo", solo la cantidad', () => {
    const markup = html({ resumen: resumenComida([v('enfermo', 'Solo sopa')]) })
    expect(markup).toContain('1 enfermo')
    expect(markup).not.toContain('Solo sopa')
  })

  it('los extras van aparte, debajo', () => {
    expect(html({ resumen, extra: 3 })).toContain('+3 extra')
    expect(html({ resumen, extra: 0 })).not.toContain('extra')
    expect(html({ resumen })).not.toContain('extra')
  })

  it('las notas de los extras se listan', () => {
    const markup = html({ resumen, extra: 2, notas: ['Sin sal', 'Llegan 12:30'] })
    expect(markup).toContain('<ul class="notas-extra"><li>Sin sal</li><li>Llegan 12:30</li></ul>')
  })

  it('como spans no usa listas, para poder ir dentro de un botón', () => {
    const markup = html({ resumen, extra: 2, notas: ['Sin sal'], como: 'spans' })
    expect(markup).not.toMatch(/<(ul|li|div|p)\b/)
    expect(markup).toContain('<span class="partes">')
    expect(markup).toContain('<span class="parte sin-definir">')
    expect(markup).toContain('<span class="notas-extra"><span>Sin sal</span></span>')
  })
})
