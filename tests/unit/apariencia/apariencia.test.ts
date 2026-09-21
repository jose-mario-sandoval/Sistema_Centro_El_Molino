import { describe, expect, it } from 'vitest'
import {
  APARIENCIA_POR_DEFECTO,
  atributosApariencia,
  CLAVE_APARIENCIA,
  CONTRASTES,
  leerGuardado,
  resolverApariencia,
  SCRIPT_APARIENCIA,
  TAMANOS,
  TEMAS,
} from '@/lib/apariencia'

describe('leerGuardado', () => {
  it('lee una apariencia completa', () => {
    expect(leerGuardado('{"tema":"oscuro","contraste":"alto","texto":"enorme"}')).toEqual({
      tema: 'oscuro',
      contraste: 'alto',
      texto: 'enorme',
    })
  })

  it('descarta valores desconocidos y conserva los válidos', () => {
    expect(leerGuardado('{"tema":"morado","contraste":"alto","texto":42}')).toEqual({ contraste: 'alto' })
  })

  it.each([[null], [''], ['no es json'], ['null'], ['"texto"'], ['[1,2]']])('sin nada utilizable en %j', (texto) => {
    expect(leerGuardado(texto)).toEqual({})
  })
})

describe('resolverApariencia', () => {
  it('sin nada guardado usa los valores por defecto', () => {
    expect(resolverApariencia({}, false)).toEqual(APARIENCIA_POR_DEFECTO)
  })

  it('si el sistema pide más contraste y la persona no eligió, usa contraste alto', () => {
    expect(resolverApariencia({}, true).contraste).toBe('alto')
  })

  it('lo que la persona eligió gana sobre el sistema', () => {
    expect(resolverApariencia({ contraste: 'suave' }, true).contraste).toBe('suave')
  })
})

describe('atributosApariencia', () => {
  it('los valores por defecto no ponen ningún atributo', () => {
    expect(atributosApariencia(APARIENCIA_POR_DEFECTO)).toEqual({
      'data-theme': null,
      'data-contraste': null,
      'data-texto': null,
    })
  })

  it('usa light/dark, el atributo que ya espera globals.css', () => {
    expect(atributosApariencia({ ...APARIENCIA_POR_DEFECTO, tema: 'claro' })['data-theme']).toBe('light')
    expect(atributosApariencia({ ...APARIENCIA_POR_DEFECTO, tema: 'oscuro' })['data-theme']).toBe('dark')
  })
})

/** Ejecuta el script de <head> con un documento mínimo y devuelve los atributos que dejó. */
function correrScript(guardado: string | null, sistemaPideContraste: boolean) {
  const atributos: Record<string, string> = {}
  const document = { documentElement: { setAttribute: (k: string, v: string) => (atributos[k] = v) } }
  const localStorage = { getItem: (k: string) => (k === CLAVE_APARIENCIA ? guardado : null) }
  const window = { matchMedia: (q: string) => ({ matches: sistemaPideContraste && q === '(prefers-contrast: more)' }) }
  new Function('document', 'localStorage', 'window', SCRIPT_APARIENCIA)(document, localStorage, window)
  return atributos
}

function esperado(guardado: string | null, sistemaPideContraste: boolean) {
  const atributos = atributosApariencia(resolverApariencia(leerGuardado(guardado), sistemaPideContraste))
  return Object.fromEntries(Object.entries(atributos).filter(([, v]) => v !== null))
}

describe('SCRIPT_APARIENCIA', () => {
  const guardados: (string | null)[] = [null, '{}', 'basura', '{"tema":"morado"}']
  for (const tema of TEMAS)
    for (const contraste of CONTRASTES)
      for (const texto of TAMANOS) guardados.push(JSON.stringify({ tema, contraste, texto }))
  for (const contraste of CONTRASTES) guardados.push(JSON.stringify({ contraste }))

  it.each(guardados.flatMap((g) => [[g, false] as const, [g, true] as const]))(
    'coincide con la lógica de TypeScript para %s (sistema pide contraste: %s)',
    (guardado, sistema) => {
      expect(correrScript(guardado, sistema)).toEqual(esperado(guardado, sistema))
    },
  )

  it('no rompe la página si el almacenamiento está bloqueado', () => {
    const document = { documentElement: { setAttribute: () => {} } }
    const localStorage = {
      getItem: () => {
        throw new Error('bloqueado')
      },
    }
    expect(() =>
      new Function('document', 'localStorage', 'window', SCRIPT_APARIENCIA)(document, localStorage, {}),
    ).not.toThrow()
  })
})
