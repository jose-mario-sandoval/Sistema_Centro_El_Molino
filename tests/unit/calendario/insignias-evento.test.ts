import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { InsigniasEvento } from '@/app/(app)/calendario/_componentes/insignias-evento'
import type { Evento } from '@/lib/calendario/tipos'

function html(props: ComponentProps<typeof InsigniasEvento>): string {
  return renderToStaticMarkup(createElement(InsigniasEvento, props))
}

const evento: Evento = {
  id: 'e1',
  titulo: 'Merienda y comida',
  fecha: '2026-10-07',
  hora: '16:00:00',
  tipo: 'san_gabriel',
  requiere_cocina: ['merienda', 'comida'],
  requiere_otro_texto: null,
  serie_id: null,
}

describe('InsigniasEvento', () => {
  it('la casa ve el tipo con su marca y lo que el evento pide a la cocina', () => {
    const markup = html({ evento })
    expect(markup).toContain('class="pastilla-tipo"')
    expect(markup).toContain('data-marca="SG"')
    expect(markup).toContain('San Gabriel')
    expect(markup.match(/class="pastilla-cocina"/g)).toHaveLength(2)
  })

  it('soloTipo (Administración): la categoría sí; el pedido no se repite, ya es el texto del evento', () => {
    const markup = html({ evento, soloTipo: true })
    expect(markup).toContain('San Gabriel')
    expect(markup).toContain('data-marca="SG"')
    expect(markup).not.toContain('pastilla-cocina')
  })

  it('un evento sin tipo no pinta nada', () => {
    expect(html({ evento: { ...evento, tipo: null } })).toBe('')
  })
})
