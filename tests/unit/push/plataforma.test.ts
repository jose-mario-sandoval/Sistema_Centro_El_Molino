import { describe, expect, it } from 'vitest'
import { base64UrlABytes, esIOS, evaluarSoporte, type EntornoNavegador } from '@/lib/push/plataforma'

const UA_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const UA_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const UA_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'

const android: EntornoNavegador = {
  userAgent: UA_ANDROID,
  maxTouchPoints: 5,
  standalone: false,
  serviceWorker: true,
  pushManager: true,
  notificaciones: true,
  permiso: 'default',
}

describe('esIOS', () => {
  it('detecta iPhone', () => {
    expect(esIOS({ userAgent: UA_IPHONE, maxTouchPoints: 5 })).toBe(true)
  })

  it('detecta iPad que se presenta como Mac (pantalla táctil)', () => {
    expect(esIOS({ userAgent: UA_MAC, maxTouchPoints: 5 })).toBe(true)
  })

  it('no confunde una Mac ni un Android', () => {
    expect(esIOS({ userAgent: UA_MAC, maxTouchPoints: 0 })).toBe(false)
    expect(esIOS({ userAgent: UA_ANDROID, maxTouchPoints: 5 })).toBe(false)
  })
})

describe('evaluarSoporte', () => {
  it('iPhone en Safari sin instalar: pide agregar a pantalla de inicio', () => {
    expect(
      evaluarSoporte({ ...android, userAgent: UA_IPHONE, pushManager: false, notificaciones: false, permiso: null }),
    ).toBe('ios-instalar')
  })

  it('iPhone con la app instalada y soporte push: disponible', () => {
    expect(evaluarSoporte({ ...android, userAgent: UA_IPHONE, standalone: true })).toBe('disponible')
  })

  it('iPhone instalado pero sin PushManager (iOS < 16.4): sin soporte', () => {
    expect(evaluarSoporte({ ...android, userAgent: UA_IPHONE, standalone: true, pushManager: false })).toBe('sin-soporte')
  })

  it('permiso denegado: bloqueado', () => {
    expect(evaluarSoporte({ ...android, permiso: 'denied' })).toBe('bloqueado')
  })

  it('Android con permiso concedido: disponible', () => {
    expect(evaluarSoporte({ ...android, permiso: 'granted' })).toBe('disponible')
  })

  it('navegador sin service worker: sin soporte', () => {
    expect(evaluarSoporte({ ...android, serviceWorker: false })).toBe('sin-soporte')
  })
})

describe('base64UrlABytes', () => {
  it('decodifica base64url sin relleno', () => {
    expect(Array.from(base64UrlABytes('AQID-_8'))).toEqual([1, 2, 3, 251, 255])
  })
})
