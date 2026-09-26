import { createElement, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { MiniCalendario } from '@/components/ui/mini-calendario'
import { SIN_SELECCION } from '@/lib/calendario/seleccion-rango'

type Props = ComponentProps<typeof MiniCalendario>

/** Render estático (lo que pinta el servidor): atributos y clases, sin navegador. */
function pintar(props: Partial<Props> = {}): string {
  return renderToStaticMarkup(
    createElement(MiniCalendario, {
      hoy: '2026-09-26',
      min: '2026-09-26',
      max: '2027-09-26',
      ausencias: [],
      seleccion: SIN_SELECCION,
      alTocar: () => {},
      ...props,
    }),
  )
}

/** La etiqueta de apertura del botón de ese día. */
function dia(html: string, fecha: string): string {
  const encontrado = html.match(new RegExp(`<button[^>]*data-fecha="${fecha}"[^>]*>`))
  if (!encontrado) throw new Error(`No hay botón para ${fecha}`)
  return encontrado[0]
}

const contar = (html: string, texto: string) => html.split(texto).length - 1

describe('MiniCalendario', () => {
  it('cabecera de la semana con el nombre completo del día como abreviatura', () => {
    const html = pintar()
    expect(html).toMatch(/<th scope="col" abbr="Lunes">Lun<\/th>/)
    expect(html).toMatch(/<th scope="col" abbr="Miércoles">Mié<\/th>/)
    expect(html).toMatch(/<th scope="col" abbr="Domingo">Dom<\/th>/)
  })

  it('una tabla de cuadrícula nombrada por el mes, con un botón .mini-dia por día del mes', () => {
    const html = pintar()
    expect(html).toContain('data-mes="2026-09"')
    expect(html).toContain('Septiembre de 2026')
    const titulo = html.match(/<table[^>]*role="grid"[^>]*aria-labelledby="([^"]+)"/)
    expect(titulo).not.toBeNull()
    expect(html).toContain(`id="${titulo![1]}"`)
    expect(contar(html, 'class="mini-dia')).toBe(30)
    // Ni la clase ni el selector de los días del calendario grande: los E2E los buscan como únicos.
    expect(html).not.toContain('cal-day')
  })

  it('los días pasados no se pueden tocar; hoy sí, y se anuncia', () => {
    const html = pintar()
    expect(dia(html, '2026-09-25')).toContain('disabled=""')
    expect(dia(html, '2026-09-01')).toContain('disabled=""')
    const hoy = dia(html, '2026-09-26')
    expect(hoy).not.toContain('disabled')
    expect(hoy).toContain('aria-current="date"')
    expect(hoy).toContain('aria-label="Sábado, 26 de septiembre de 2026, hoy"')
  })

  it('los días ya ausentes se marcan con clase, icono y texto', () => {
    const html = pintar({ ausencias: [{ desde: '2026-09-28', hasta: '2026-09-29' }] })
    for (const fecha of ['2026-09-28', '2026-09-29']) {
      expect(dia(html, fecha)).toMatch(/class="mini-dia[^"]*\bmarcado\b/)
      expect(dia(html, fecha)).toContain('ya marcado como ausente')
    }
    expect(dia(html, '2026-09-30')).not.toContain('marcado')
    expect(contar(html, 'mini-icono')).toBe(2)
  })

  it('los días elegidos quedan presionados, con sus extremos marcados', () => {
    const html = pintar({ seleccion: { desde: '2026-09-28', hasta: '2026-09-30' } })
    expect(dia(html, '2026-09-27')).toContain('aria-pressed="false"')
    for (const fecha of ['2026-09-28', '2026-09-29', '2026-09-30']) expect(dia(html, fecha)).toContain('aria-pressed="true"')
    expect(dia(html, '2026-09-28')).toMatch(/\bextremo\b/)
    expect(dia(html, '2026-09-29')).not.toMatch(/\bextremo\b/)
    expect(dia(html, '2026-09-30')).toMatch(/\bextremo\b/)
  })

  it('un solo punto de tabulación: el primer día elegido, o si no hoy', () => {
    const sinElegir = pintar()
    expect(contar(sinElegir, 'tabindex="0"')).toBe(1)
    expect(dia(sinElegir, '2026-09-26')).toContain('tabindex="0"')
    const conElegido = pintar({ seleccion: { desde: '2026-09-28', hasta: null } })
    expect(contar(conElegido, 'tabindex="0"')).toBe(1)
    expect(dia(conElegido, '2026-09-28')).toContain('tabindex="0"')
  })

  it('no deja ir antes del mes de hoy; sí al siguiente', () => {
    const html = pintar()
    expect(html).toMatch(/<button[^>]*aria-label="Ir al mes anterior"[^>]*aria-disabled="true"/)
    expect(html).not.toMatch(/<button[^>]*aria-label="Ir al mes siguiente"[^>]*aria-disabled="true"/)
  })

  it('abre en el mes pedido', () => {
    const html = pintar({ mesInicial: '2026-10' })
    expect(html).toContain('data-mes="2026-10"')
    expect(contar(html, 'class="mini-dia')).toBe(31)
    expect(dia(html, '2026-10-01')).toContain('tabindex="0"')
  })
})
