import { describe, expect, it } from 'vitest'
import {
  esEndpointPushPermitido,
  esquemaBajaPush,
  esquemaPreferenciasAvisos,
  esquemaSuscripcionPush,
} from '@/lib/validacion/push'

const valida = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  expirationTime: null,
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' },
}

describe('esEndpointPushPermitido', () => {
  it('acepta los servicios push de Chrome, Firefox y Safari', () => {
    expect(esEndpointPushPermitido('https://fcm.googleapis.com/fcm/send/abc123')).toBe(true)
    expect(esEndpointPushPermitido('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true)
    expect(esEndpointPushPermitido('https://web.push.apple.com/QRST')).toBe(true)
  })

  it('acepta cualquier región de Windows', () => {
    expect(esEndpointPushPermitido('https://db5p.notify.windows.com/w/?token=abc')).toBe(true)
    expect(esEndpointPushPermitido('https://notify.windows.com/w/?token=abc')).toBe(false)
  })

  it('rechaza hosts desconocidos, direcciones internas y otros protocolos', () => {
    expect(esEndpointPushPermitido('https://atacante.example/push')).toBe(false)
    expect(esEndpointPushPermitido('https://127.0.0.1/push')).toBe(false)
    expect(esEndpointPushPermitido('http://fcm.googleapis.com/fcm/send/abc')).toBe(false)
    expect(esEndpointPushPermitido('no-es-una-url')).toBe(false)
  })

  it('no se deja engañar por subdominios ni credenciales en la URL', () => {
    expect(esEndpointPushPermitido('https://fcm.googleapis.com.atacante.example/x')).toBe(false)
    expect(esEndpointPushPermitido('https://atacante.example/fcm.googleapis.com')).toBe(false)
    expect(esEndpointPushPermitido('https://x.notify.windows.com.atacante.example/w')).toBe(false)
    expect(esEndpointPushPermitido('https://fcm.googleapis.com@atacante.example/x')).toBe(false)
  })
})

describe('esquemaSuscripcionPush', () => {
  it('acepta PushSubscription.toJSON() y descarta campos extra', () => {
    const resultado = esquemaSuscripcionPush.safeParse(valida)
    expect(resultado.success).toBe(true)
    expect(resultado.data).toEqual({ endpoint: valida.endpoint, keys: valida.keys })
  })

  it('rechaza endpoints que no son https', () => {
    expect(esquemaSuscripcionPush.safeParse({ ...valida, endpoint: 'http://push.example.com/x' }).success).toBe(false)
  })

  it('rechaza endpoints de servicios push desconocidos', () => {
    expect(esquemaSuscripcionPush.safeParse({ ...valida, endpoint: 'https://atacante.example/push' }).success).toBe(
      false,
    )
  })

  it('rechaza suscripciones sin llaves o con llaves demasiado largas', () => {
    expect(esquemaSuscripcionPush.safeParse({ endpoint: valida.endpoint }).success).toBe(false)
    expect(
      esquemaSuscripcionPush.safeParse({ ...valida, keys: { ...valida.keys, p256dh: 'x'.repeat(201) } }).success,
    ).toBe(false)
  })
})

describe('esquemaBajaPush', () => {
  it('exige un endpoint https de un servicio conocido', () => {
    expect(esquemaBajaPush.safeParse({ endpoint: valida.endpoint }).success).toBe(true)
    expect(esquemaBajaPush.safeParse({ endpoint: 'no-es-url' }).success).toBe(false)
    expect(esquemaBajaPush.safeParse({ endpoint: 'https://atacante.example/push' }).success).toBe(false)
  })
})

describe('esquemaPreferenciasAvisos', () => {
  it('exige los dos valores booleanos', () => {
    expect(esquemaPreferenciasAvisos.safeParse({ avisarHoraLimite: true, avisarMensajes: false }).success).toBe(true)
    expect(esquemaPreferenciasAvisos.safeParse({ avisarHoraLimite: 'si', avisarMensajes: false }).success).toBe(false)
    expect(esquemaPreferenciasAvisos.safeParse({ avisarMensajes: true }).success).toBe(false)
  })
})
