import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { InsigniaConteo, textoPendientes } from '@/components/app/pendientes'

const html = (n: number) => renderToStaticMarkup(createElement(InsigniaConteo, { n, texto: textoPendientes(n) }))

describe('globito de pendientes', () => {
  it('muestra el número, oculto al lector, y al lector le da la frase completa', () => {
    expect(html(3)).toBe(
      '<span class="insignia-conteo" aria-hidden="true">3</span><span class="sr-only">, 3 mensajes pendientes de aprobación</span>',
    )
  })

  it('en singular con uno', () => {
    expect(textoPendientes(1)).toBe('1 mensaje pendiente de aprobación')
  })

  it('sin pendientes no pinta nada', () => {
    expect(html(0)).toBe('')
  })

  it('más de 99 se abrevia en pantalla, no para el lector', () => {
    expect(html(120)).toContain('>99+</span>')
    expect(html(120)).toContain('120 mensajes pendientes')
  })
})
