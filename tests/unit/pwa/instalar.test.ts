import { describe, expect, it } from 'vitest'
import {
  CLAVE_AVISOS_DESCARTADOS,
  CLAVE_INSTALADA,
  CLAVE_INSTALAR_DESCARTADA,
  debeOfrecerAvisos,
  debeOfrecerInstalar,
  esTelefonoOTablet,
  navegadorIOS,
  pasosIOS,
  puedeSerMovil,
  scriptInstalacion,
  SIETE_DIAS_MS,
  sigueDescartada,
  varianteInstalar,
} from '@/lib/pwa/instalar'

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0.6613.98 Mobile/15E148 Safari/604.1',
  iphoneEdge:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/128.2739.60 Mobile/15E148 Safari/605.1.15',
  ipadViejo:
    'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ con Safari se presenta como una Mac: se distingue por la pantalla táctil.
  macOiPad:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  android:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  androidTablet:
    'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  firefoxAndroid: 'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
  windows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  linux: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
}

describe('esTelefonoOTablet', () => {
  it.each([
    ['iPhone', UA.iphoneSafari, 5],
    ['iPhone con Chrome', UA.iphoneChrome, 5],
    ['iPad viejo', UA.ipadViejo, 5],
    ['iPad que se presenta como Mac', UA.macOiPad, 5],
    ['Android', UA.android, 5],
    ['tablet Android', UA.androidTablet, 5],
    ['Firefox en Android', UA.firefoxAndroid, 5],
  ])('%s: sí', (_nombre, userAgent, maxTouchPoints) => {
    expect(esTelefonoOTablet({ userAgent, maxTouchPoints })).toBe(true)
  })

  it.each([
    ['Mac', UA.macOiPad, 0],
    ['Windows (aunque tenga pantalla táctil)', UA.windows, 10],
    ['Linux', UA.linux, 0],
  ])('%s: no', (_nombre, userAgent, maxTouchPoints) => {
    expect(esTelefonoOTablet({ userAgent, maxTouchPoints })).toBe(false)
  })
})

describe('puedeSerMovil (servidor: solo el User-Agent)', () => {
  it('los teléfonos y tablets, y también "Macintosh" (puede ser un iPad)', () => {
    expect(puedeSerMovil(UA.android)).toBe(true)
    expect(puedeSerMovil(UA.iphoneSafari)).toBe(true)
    expect(puedeSerMovil(UA.macOiPad)).toBe(true)
  })

  it('escritorio (Windows, Linux) o sin User-Agent: no se pinta nada', () => {
    expect(puedeSerMovil(UA.windows)).toBe(false)
    expect(puedeSerMovil(UA.linux)).toBe(false)
    expect(puedeSerMovil(null)).toBe(false)
  })
})

describe('varianteInstalar', () => {
  it('con el evento del navegador, el botón de instalar de verdad', () => {
    expect(varianteInstalar({ ios: false, hayPromptNativo: true })).toBe('nativa')
  })

  it('iPhone y iPad: los pasos', () => {
    expect(varianteInstalar({ ios: true, hayPromptNativo: false })).toBe('ios')
  })

  it('cualquier otro (o Chrome antes de que llegue el evento): instrucciones del menú', () => {
    expect(varianteInstalar({ ios: false, hayPromptNativo: false })).toBe('generica')
  })
})

describe('"Ahora no": 7 días', () => {
  const AHORA = Date.UTC(2026, 8, 29, 17)
  it('sigue descartada durante 7 días desde que se tocó', () => {
    expect(sigueDescartada(String(AHORA - 1000), AHORA)).toBe(true)
    expect(sigueDescartada(String(AHORA - SIETE_DIAS_MS + 1), AHORA)).toBe(true)
  })

  it('a los 7 días vuelve a aparecer', () => {
    expect(sigueDescartada(String(AHORA - SIETE_DIAS_MS), AHORA)).toBe(false)
  })

  it('sin nada guardado, basura o una hora en el futuro (reloj cambiado): no cuenta', () => {
    for (const guardado of [null, '', 'ayer', 'NaN', String(AHORA + 60_000)]) {
      expect(sigueDescartada(guardado, AHORA)).toBe(false)
    }
  })
})

describe('debeOfrecerInstalar', () => {
  const base = { movil: true, standalone: false, instalada: false, descartadaEn: null, ahora: 1_000_000_000_000 }
  it('en un teléfono, en el navegador, sin descartar ni instalar', () => {
    expect(debeOfrecerInstalar(base)).toBe(true)
  })

  it('nunca en escritorio, en la app instalada, si ya se instaló o si se descartó hace poco', () => {
    expect(debeOfrecerInstalar({ ...base, movil: false })).toBe(false)
    expect(debeOfrecerInstalar({ ...base, standalone: true })).toBe(false)
    expect(debeOfrecerInstalar({ ...base, instalada: true })).toBe(false)
    expect(debeOfrecerInstalar({ ...base, descartadaEn: String(base.ahora - 1000) })).toBe(false)
  })
})

describe('debeOfrecerAvisos (después de instalar)', () => {
  const base = {
    movil: true,
    standalone: true,
    pushDisponible: true,
    conLlave: true,
    permiso: 'default' as const,
    descartadaEn: null,
    ahora: 1_000_000_000_000,
  }
  it('en la app instalada, con el permiso sin pedir', () => {
    expect(debeOfrecerAvisos(base)).toBe(true)
  })

  it('no en el navegador, ni si ya decidió (concedido o bloqueado), ni sin push o sin llave, ni descartado', () => {
    expect(debeOfrecerAvisos({ ...base, standalone: false })).toBe(false)
    expect(debeOfrecerAvisos({ ...base, movil: false })).toBe(false)
    expect(debeOfrecerAvisos({ ...base, permiso: 'granted' })).toBe(false)
    expect(debeOfrecerAvisos({ ...base, permiso: 'denied' })).toBe(false)
    expect(debeOfrecerAvisos({ ...base, permiso: null })).toBe(false)
    expect(debeOfrecerAvisos({ ...base, pushDisponible: false })).toBe(false)
    expect(debeOfrecerAvisos({ ...base, conLlave: false })).toBe(false)
    expect(debeOfrecerAvisos({ ...base, descartadaEn: String(base.ahora - 1000) })).toBe(false)
  })
})

describe('pasos en iPhone y iPad', () => {
  it('distingue el aparato y si es Safari', () => {
    expect(navegadorIOS({ userAgent: UA.iphoneSafari, maxTouchPoints: 5 })).toEqual({ aparato: 'iphone', safari: true })
    expect(navegadorIOS({ userAgent: UA.iphoneChrome, maxTouchPoints: 5 })).toEqual({ aparato: 'iphone', safari: false })
    expect(navegadorIOS({ userAgent: UA.iphoneEdge, maxTouchPoints: 5 })).toEqual({ aparato: 'iphone', safari: false })
    expect(navegadorIOS({ userAgent: UA.macOiPad, maxTouchPoints: 5 })).toEqual({ aparato: 'ipad', safari: true })
    expect(navegadorIOS({ userAgent: UA.ipadViejo, maxTouchPoints: 5 })).toEqual({ aparato: 'ipad', safari: true })
  })

  it('tres pasos; dónde está Compartir depende del aparato y del navegador', () => {
    const iphone = pasosIOS({ aparato: 'iphone', safari: true })
    expect(iphone.map((p) => p.titulo)).toEqual([
      'Tocá el botón Compartir',
      'Elegí «Agregar a pantalla de inicio»',
      'Abrí El Molino desde el ícono nuevo',
    ])
    expect(iphone[0].detalle).toContain('abajo')
    expect(pasosIOS({ aparato: 'ipad', safari: true })[0].detalle).toContain('arriba')
    expect(pasosIOS({ aparato: 'iphone', safari: false })[0].detalle).toContain('arriba')
  })
})

/** Ejecuta el script de <head> con un navegador mínimo y devuelve los atributos y lo que capturó. */
function correrScript(p: {
  userAgent: string
  maxTouchPoints?: number
  standalone?: boolean
  permiso?: 'default' | 'granted' | 'denied' | null
  guardado?: Record<string, string>
  conAvisos?: boolean
  ahora: number
  almacenamientoRoto?: boolean
}) {
  const atributos: Record<string, string> = {}
  const oyentes: Record<string, ((e: unknown) => void)[]> = {}
  const guardado = { ...(p.guardado ?? {}) }
  const localStorage = {
    getItem: (k: string) => {
      if (p.almacenamientoRoto) throw new Error('bloqueado')
      return guardado[k] ?? null
    },
    setItem: (k: string, v: string) => {
      guardado[k] = v
    },
  }
  const window: Record<string, unknown> = {
    matchMedia: (q: string) => ({ matches: Boolean(p.standalone) && q === '(display-mode: standalone)' }),
    addEventListener: (tipo: string, fn: (e: unknown) => void) => (oyentes[tipo] ??= []).push(fn),
    dispatchEvent: () => true,
  }
  Object.defineProperty(window, 'localStorage', {
    get: () => {
      if (p.almacenamientoRoto) throw new Error('SecurityError')
      return localStorage
    },
  })
  if (p.permiso !== null) {
    window.Notification = { permission: p.permiso ?? 'default' }
    window.PushManager = function PushManager() {}
  }
  const navigator: Record<string, unknown> = { userAgent: p.userAgent, maxTouchPoints: p.maxTouchPoints ?? 0, serviceWorker: {} }
  const document = { documentElement: { setAttribute: (k: string, v: string) => (atributos[k] = v) } }
  const Date = { now: () => p.ahora }
  const Event = class {
    constructor(public type: string) {}
  }
  new Function('document', 'window', 'navigator', 'Date', 'Event', scriptInstalacion({ conAvisos: p.conAvisos ?? true }))(
    document,
    window,
    navigator,
    Date,
    Event,
  )
  return { atributos, oyentes, window, guardado }
}

describe('scriptInstalacion (antes de pintar)', () => {
  const AHORA = 1_900_000_000_000
  const combinaciones = [
    { userAgent: UA.android, maxTouchPoints: 5 },
    { userAgent: UA.iphoneSafari, maxTouchPoints: 5 },
    { userAgent: UA.macOiPad, maxTouchPoints: 5 },
    { userAgent: UA.macOiPad, maxTouchPoints: 0 },
    { userAgent: UA.windows, maxTouchPoints: 10 },
    { userAgent: UA.firefoxAndroid, maxTouchPoints: 5 },
  ]
  const guardados: Record<string, string>[] = [
    {},
    { [CLAVE_INSTALAR_DESCARTADA]: String(AHORA - 1000) },
    { [CLAVE_INSTALAR_DESCARTADA]: String(AHORA - SIETE_DIAS_MS - 1) },
    { [CLAVE_INSTALADA]: '1' },
    { [CLAVE_AVISOS_DESCARTADOS]: String(AHORA - 1000) },
    { [CLAVE_INSTALAR_DESCARTADA]: 'basura', [CLAVE_AVISOS_DESCARTADOS]: String(AHORA + 5000) },
  ]
  const casos = combinaciones.flatMap((c) =>
    guardados.flatMap((guardado) =>
      [false, true].flatMap((standalone) =>
        (['default', 'granted', 'denied', null] as const).flatMap((permiso) =>
          [true, false].map((conAvisos) => ({ ...c, guardado, standalone, permiso, conAvisos })),
        ),
      ),
    ),
  )

  it(`coincide con la lógica de TypeScript en ${casos.length} combinaciones`, () => {
    for (const caso of casos) {
      const { atributos } = correrScript({ ...caso, ahora: AHORA })
      const movil = esTelefonoOTablet(caso)
      const esperado: Record<string, string> = {}
      if (
        debeOfrecerInstalar({
          movil,
          standalone: caso.standalone,
          instalada: caso.guardado[CLAVE_INSTALADA] === '1',
          descartadaEn: caso.guardado[CLAVE_INSTALAR_DESCARTADA] ?? null,
          ahora: AHORA,
        })
      ) {
        esperado['data-instalar'] = 'ofrecer'
      }
      if (
        debeOfrecerAvisos({
          movil,
          standalone: caso.standalone,
          pushDisponible: caso.permiso !== null,
          conLlave: caso.conAvisos,
          permiso: caso.permiso,
          descartadaEn: caso.guardado[CLAVE_AVISOS_DESCARTADOS] ?? null,
          ahora: AHORA,
        })
      ) {
        esperado['data-ofrecer-avisos'] = 'si'
      }
      expect(atributos, JSON.stringify(caso)).toEqual(esperado)
    }
  })

  it('captura el evento de instalación antes de que cargue React y evita la barra propia del navegador', () => {
    const { oyentes, window } = correrScript({ userAgent: UA.android, maxTouchPoints: 5, ahora: AHORA })
    let prevenido = false
    const evento = { preventDefault: () => (prevenido = true) }
    for (const oyente of oyentes.beforeinstallprompt ?? []) oyente(evento)
    expect(prevenido).toBe(true)
    expect(window.__molinoInstalar).toBe(evento)
  })

  it('al instalarse lo anota en el dispositivo y suelta el evento', () => {
    const { oyentes, window, guardado } = correrScript({ userAgent: UA.android, maxTouchPoints: 5, ahora: AHORA })
    for (const oyente of oyentes.beforeinstallprompt ?? []) oyente({ preventDefault: () => {} })
    for (const oyente of oyentes.appinstalled ?? []) oyente({})
    expect(guardado[CLAVE_INSTALADA]).toBe('1')
    expect(window.__molinoInstalar).toBeNull()
  })

  it('no rompe la página si el almacenamiento está bloqueado', () => {
    expect(() => correrScript({ userAgent: UA.android, maxTouchPoints: 5, ahora: AHORA, almacenamientoRoto: true })).not.toThrow()
    expect(correrScript({ userAgent: UA.android, maxTouchPoints: 5, ahora: AHORA, almacenamientoRoto: true }).atributos).toEqual({
      'data-instalar': 'ofrecer',
    })
  })
})
