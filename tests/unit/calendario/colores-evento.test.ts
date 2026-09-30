import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TIPOS_EVENTO } from '@/lib/calendario/tipos'

/**
 * Los colores de los tipos de evento (DESIGN.md §2.4), leídos de globals.css tal cual: si alguien
 * cambia un valor, esta prueba vuelve a medir el contraste en los cuatro modos.
 */
const css = readFileSync(new URL('../../../app/globals.css', import.meta.url), 'utf8')

/** Las variables de un bloque cuyo selector es exactamente `selector` (el primero que aparece). */
function variables(selector: string): Record<string, string> {
  const inicio = css.search(new RegExp(`(^|[\\s{}])${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`))
  if (inicio < 0) throw new Error(`No está el bloque ${selector}`)
  const abre = css.indexOf('{', inicio)
  const cierra = css.indexOf('}', abre)
  const cuerpo = css.slice(abre + 1, cierra).replace(/\/\*[\s\S]*?\*\//g, '')
  return Object.fromEntries([...cuerpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))
}

const claro = variables(':root')
const oscuroMedia = variables(':root:not([data-theme="light"])')
const oscuroTema = variables(':root[data-theme="dark"]')
const alto = variables(':root[data-contraste="alto"]')
const altoOscuroMedia = variables(':root[data-contraste="alto"]:not([data-theme="light"])')
const altoOscuroTema = variables(':root[data-contraste="alto"][data-theme="dark"]')

const MODOS = {
  'claro / suave': { vars: claro, minimo: 4.5 },
  'oscuro / suave': { vars: { ...claro, ...oscuroTema }, minimo: 4.5 },
  'claro / alto': { vars: { ...claro, ...alto }, minimo: 7 },
  'oscuro / alto': { vars: { ...claro, ...oscuroTema, ...alto, ...altoOscuroTema }, minimo: 7 },
}

const lineal = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function luminancia(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => lineal(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contraste(a: string, b: string): number {
  const [claroL, oscuroL] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (claroL + 0.05) / (oscuroL + 0.05)
}

const token = (tipo: string) => `--ev-${tipo.replace('_', '-')}`
const ev = (vars: Record<string, string>, tipo: string) => vars[token(tipo)]
const evBg = (vars: Record<string, string>, tipo: string) => vars[`${token(tipo)}-bg`]

describe('colores de los tipos de evento', () => {
  it('cada tipo tiene color y tinte en hexadecimal en :root', () => {
    for (const tipo of TIPOS_EVENTO) {
      expect(ev(claro, tipo), token(tipo)).toMatch(/^#[0-9A-F]{6}$/i)
      expect(evBg(claro, tipo), `${token(tipo)}-bg`).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('el tema oscuro dice lo mismo por la preferencia del sistema y por [data-theme=dark]', () => {
    const soloEv = (v: Record<string, string>) => Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith('--ev-')))
    expect(Object.keys(soloEv(oscuroTema)).length).toBe(TIPOS_EVENTO.length * 2)
    expect(soloEv(oscuroMedia)).toEqual(soloEv(oscuroTema))
    expect(soloEv(altoOscuroMedia)).toEqual(soloEv(altoOscuroTema))
  })

  it('contraste alto cambia el color de cada tipo, en claro y en oscuro', () => {
    for (const tipo of TIPOS_EVENTO) {
      expect(alto[token(tipo)], `${token(tipo)} en alto`).toBeDefined()
      expect(altoOscuroTema[token(tipo)], `${token(tipo)} en alto oscuro`).toBeDefined()
    }
  })

  for (const [modo, { vars, minimo }] of Object.entries(MODOS)) {
    describe(modo, () => {
      for (const tipo of TIPOS_EVENTO) {
        it(`${tipo}: el texto sobre su tinte y sobre el pergamino llega a ${minimo}:1`, () => {
          expect(contraste(ev(vars, tipo), evBg(vars, tipo))).toBeGreaterThanOrEqual(minimo)
          expect(contraste(ev(vars, tipo), vars['--fondo'])).toBeGreaterThanOrEqual(minimo)
        })
      }

      it('la marca (relleno del color con la sigla en pergamino) se distingue del fondo: ≥3:1', () => {
        for (const tipo of TIPOS_EVENTO) expect(contraste(ev(vars, tipo), vars['--fondo'])).toBeGreaterThanOrEqual(3)
      })

      it('los cuatro colores son distintos entre sí', () => {
        const colores = TIPOS_EVENTO.map((t) => ev(vars, t).toUpperCase())
        expect(new Set(colores).size).toBe(TIPOS_EVENTO.length)
      })
    })
  }
})
