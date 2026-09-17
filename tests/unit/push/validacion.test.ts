import { describe, expect, it } from 'vitest'
import { esquemaBajaPush, esquemaPreferenciasAvisos, esquemaSuscripcionPush } from '@/lib/validacion/push'

const valida = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  expirationTime: null,
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA', auth: 'tBHItJI5svbpez7KI4CCXg' },
}

describe('esquemaSuscripcionPush', () => {
  it('acepta PushSubscription.toJSON() y descarta campos extra', () => {
    const resultado = esquemaSuscripcionPush.safeParse(valida)
    expect(resultado.success).toBe(true)
    expect(resultado.data).toEqual({ endpoint: valida.endpoint, keys: valida.keys })
  })

  it('rechaza endpoints que no son https', () => {
    expect(esquemaSuscripcionPush.safeParse({ ...valida, endpoint: 'http://push.example.com/x' }).success).toBe(false)
  })

  it('rechaza suscripciones sin llaves o con llaves demasiado largas', () => {
    expect(esquemaSuscripcionPush.safeParse({ endpoint: valida.endpoint }).success).toBe(false)
    expect(
      esquemaSuscripcionPush.safeParse({ ...valida, keys: { ...valida.keys, p256dh: 'x'.repeat(201) } }).success,
    ).toBe(false)
  })
})

describe('esquemaBajaPush', () => {
  it('exige un endpoint https', () => {
    expect(esquemaBajaPush.safeParse({ endpoint: valida.endpoint }).success).toBe(true)
    expect(esquemaBajaPush.safeParse({ endpoint: 'no-es-url' }).success).toBe(false)
  })
})

describe('esquemaPreferenciasAvisos', () => {
  it('exige los dos valores booleanos', () => {
    expect(esquemaPreferenciasAvisos.safeParse({ avisarHoraLimite: true, avisarMensajes: false }).success).toBe(true)
    expect(esquemaPreferenciasAvisos.safeParse({ avisarHoraLimite: 'si', avisarMensajes: false }).success).toBe(false)
    expect(esquemaPreferenciasAvisos.safeParse({ avisarMensajes: true }).success).toBe(false)
  })
})
