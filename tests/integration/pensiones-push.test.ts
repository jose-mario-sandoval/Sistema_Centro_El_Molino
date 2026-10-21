import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mesActual } from '@/lib/pensiones/calculos'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

const admin = clienteAdminPrueba()
const ACTUAL = mesActual()
const PREFIJO = 'https://fcm.googleapis.com/fcm/send/prueba-pension-'
let ids: Record<ClaveUsuario, string>
beforeAll(async () => { ids = await asegurarUsuariosPrueba() })
beforeEach(async () => {
  await asegurarUsuariosPrueba()
  for (const tabla of ['pensiones_pagos', 'pensiones_cuotas', 'pensiones_participacion']) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', Object.values(ids))
    if (error) throw error
  }
  expect((await admin.from('perfiles').update({ activo: true, avisar_pensiones: true }).in('id', Object.values(ids))).error).toBeNull()
  expect((await admin.from('suscripciones_push').delete().like('endpoint', `${PREFIJO}%`)).error).toBeNull()
  expect((await admin.from('pensiones_participacion').insert({ usuario_id: ids.residente, desde: ACTUAL, incluido: true })).error).toBeNull()
  const director = await clienteComo('director')
  expect((await director.rpc('guardar_cuota_pension', {
    p_usuario_id: ids.residente, p_desde: ACTUAL, p_categoria: 'universitario', p_monto_centavos: 30000,
  })).error).toBeNull()
})
afterAll(async () => {
  await admin.from('suscripciones_push').delete().like('endpoint', `${PREFIJO}%`)
  await admin.from('perfiles').update({ avisar_pensiones: true, avisar_mensajes: true, avisar_cocina: true }).in('id', Object.values(ids))
  await asegurarUsuariosPrueba()
})

async function dispositivo(clave: ClaveUsuario, sufijo = clave as string) {
  const { data, error } = await admin.from('suscripciones_push').insert({
    usuario_id: ids[clave], endpoint: `${PREFIJO}${sufijo}`, p256dh: 'clave', auth: 'auth',
  }).select('id').single()
  expect(error).toBeNull()
  return data!.id as string
}
async function registrar(pagado = 0, abono = 10000) {
  const residente = await clienteComo('residente')
  return residente.rpc('marcar_pensiones_con_movimientos', {
    p_periodos: [ACTUAL], p_montos_esperados: [30000], p_pagados_esperados: [pagado], p_abonos: [abono],
  })
}
function reservar(pagoId: string, dispositivos: string[]) {
  return admin.rpc('reservar_avisos_pago_pension', { p_pago_id: pagoId, p_suscripciones: dispositivos })
}

describe('Push de pensiones: movimientos nuevos, privacidad y deduplicación', () => {
  it('separa el abono nuevo de los históricos y conserva el estado al momento del evento', async () => {
    const parcial = await registrar()
    expect(parcial.error).toBeNull()
    expect(parcial.data).toHaveLength(1)
    const completo = await registrar(10000, 20000)
    expect(completo.error).toBeNull()
    expect(completo.data).toHaveLength(1)
    expect(completo.data[0].pago_id).not.toBe(parcial.data[0].pago_id)
    for (const [pago, abono, completado] of [[parcial, 10000, false], [completo, 20000, true]] as const) {
      const aviso = await admin.rpc('aviso_pago_pension', { p_pago_id: pago.data[0].pago_id })
      expect(aviso.error).toBeNull()
      expect(aviso.data).toEqual([{ siglas: 'RP', periodo: ACTUAL, abono_centavos: abono, completado }])
      expect(JSON.stringify(aviso.data)).not.toContain('Residente Prueba')
    }
    const residente = await clienteComo('residente')
    const reintento = await residente.rpc('marcar_pensiones_con_movimientos', { p_periodos: [ACTUAL] })
    expect(reintento.error).toBeNull()
    expect(reintento.data).toEqual([])
    expect((await admin.from('pensiones_pagos').select('id').eq('usuario_id', ids.residente)).data).toHaveLength(2)
  })

  it('dos solicitudes parciales simultáneas generan un solo movimiento y reserva única por dispositivo', async () => {
    const resultados = await Promise.all([registrar(), registrar()])
    expect(resultados.filter((r) => r.error === null)).toHaveLength(1)
    expect(resultados.find((r) => r.error)?.error?.code).toBe('40001')
    const pagoId = resultados.find((r) => r.error === null)!.data[0].pago_id
    const s = await dispositivo('administradora')
    const reservas = await Promise.all([reservar(pagoId, [s]), reservar(pagoId, [s])])
    for (const r of reservas) expect(r.error).toBeNull()
    expect(reservas.flatMap((r) => r.data)).toEqual([s])
    expect((await reservar(pagoId, [s])).data).toEqual([])
    expect((await admin.from('pensiones_pagos').select('id').eq('usuario_id', ids.residente)).data).toHaveLength(1)
  })

  it('solo Administradora activa con su preferencia recibe, aunque mensajes y cocina estén apagados', async () => {
    const pago = await registrar()
    expect(pago.error).toBeNull()
    const [correcto, cocina, director, residente] = await Promise.all([
      dispositivo('administradora'), dispositivo('administracion'), dispositivo('director'), dispositivo('residente'),
    ])
    expect((await admin.from('perfiles').update({ avisar_mensajes: false, avisar_cocina: false }).eq('id', ids.administradora)).error).toBeNull()
    expect((await reservar(pago.data[0].pago_id, [correcto, cocina, director, residente])).data).toEqual([correcto])
    const segundo = await registrar(10000, 5000)
    expect(segundo.error).toBeNull()
    expect((await admin.from('perfiles').update({ avisar_pensiones: false }).eq('id', ids.administradora)).error).toBeNull()
    expect((await reservar(segundo.data[0].pago_id, [correcto])).data).toEqual([])
    expect((await admin.from('perfiles').update({ avisar_pensiones: true, activo: false }).eq('id', ids.administradora)).error).toBeNull()
    expect((await reservar(segundo.data[0].pago_id, [correcto])).data).toEqual([])
  })

  it('un pago rechazado no deja eventos, un abono requiere saldo esperado y los servicios son privados', async () => {
    const residente = await clienteComo('residente')
    expect((await registrar(0, 30001)).error).not.toBeNull()
    expect((await residente.rpc('marcar_pensiones_con_movimientos', { p_periodos: [ACTUAL], p_abonos: [10000] })).error?.code).toBe('22023')
    const pagos = await admin.from('pensiones_pagos').select('id').eq('usuario_id', ids.residente)
    expect(pagos.data).toEqual([])
    const pago = await registrar()
    expect(pago.error).toBeNull()
    const pagoId = pago.data[0].pago_id
    expect((await residente.rpc('aviso_pago_pension', { p_pago_id: pagoId })).error?.code).toBe('42501')
    expect((await residente.rpc('reservar_avisos_pago_pension', { p_pago_id: pagoId, p_suscripciones: [] })).error?.code).toBe('42501')
    expect((await residente.from('pensiones_pagos_push').select('*')).error?.code).toBe('42501')
    expect((await residente.from('avisos_pago_pension_push').select('*')).error?.code).toBe('42501')
    expect((await residente.from('perfiles').update({ avisar_pensiones: false }).eq('id', ids.residente)).error?.code).toBe('42501')
    for (const rol of ['administracion', 'administradora'] as const) {
      expect((await (await clienteComo(rol)).rpc('marcar_pensiones_con_movimientos', { p_periodos: [ACTUAL] })).error?.code).toBe('42501')
    }
  })
})
