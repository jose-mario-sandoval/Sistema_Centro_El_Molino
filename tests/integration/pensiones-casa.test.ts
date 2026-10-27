import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mesActual } from '@/lib/pensiones/calculos'
import {
  asegurarUsuariosPrueba, clienteAdminPrueba, clienteAnonimoPrueba, clienteComo,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'

const admin = clienteAdminPrueba()
const ACTUAL = mesActual()
const siguiente = new Date(`${ACTUAL}T12:00:00Z`)
siguiente.setUTCMonth(siguiente.getUTCMonth() + 1)
const FUTURO = siguiente.toISOString().slice(0, 10)
const PREFIJO = 'https://fcm.googleapis.com/fcm/send/prueba-pension-casa-'
let ids: Record<ClaveUsuario, string>

beforeAll(async () => { ids = await asegurarUsuariosPrueba() })
beforeEach(async () => {
  await asegurarUsuariosPrueba()
  expect((await admin.from('pensiones_exencion').delete().eq('unica', true)).error).toBeNull()
  expect((await admin.from('perfiles').update({ activo: true, avisar_pensiones: true }).in('id', Object.values(ids))).error).toBeNull()
  for (const tabla of ['pensiones_pagos', 'pensiones_cuotas', 'pensiones_participacion']) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', Object.values(ids))
    if (error) throw error
  }
  expect((await admin.from('suscripciones_push').delete().like('endpoint', `${PREFIJO}%`)).error).toBeNull()
  expect((await admin.from('pensiones_participacion').insert(
    (['director', 'director2', 'residente', 'residente2'] as const)
      .map((clave) => ({ usuario_id: ids[clave], desde: '2000-01-01', incluido: true })),
  )).error).toBeNull()
  expect((await admin.from('pensiones_cuotas').insert([
    { usuario_id: ids.director, desde: '2000-01-01', categoria: 'profesional', monto_centavos: 70000 },
    { usuario_id: ids.director2, desde: '2000-01-01', categoria: 'profesional', monto_centavos: 50000 },
    { usuario_id: ids.residente, desde: '2000-01-01', categoria: 'universitario', monto_centavos: 30000 },
  ])).error).toBeNull()
})
afterAll(async () => {
  await admin.from('pensiones_exencion').delete().eq('unica', true)
  await admin.from('suscripciones_push').delete().like('endpoint', `${PREFIJO}%`)
  await asegurarUsuariosPrueba()
})

async function registrar(usuario: ClaveUsuario = 'residente', pagado = 0, abono = 10000, periodo = ACTUAL) {
  return (await clienteComo('director')).rpc('marcar_pensiones_de_con_movimientos', {
    p_usuario_id: ids[usuario], p_periodos: [periodo], p_montos_esperados: [usuario === 'director2' ? 50000 : 30000],
    p_pagados_esperados: [pagado], p_abonos: [abono],
  })
}

describe('Pensiones de la casa: permisos, titular y trazabilidad', () => {
  it('solo Director consulta/registra; no permite self, cuentas inactivas, otros roles ni UUID inexistente', async () => {
    for (const rol of ['residente', 'administracion', 'administradora'] as const) {
      const cliente = await clienteComo(rol)
      expect((await cliente.rpc('pensiones_de', { p_usuario_id: ids.residente, p_anio: 2026 })).error?.code).toBe('42501')
      expect((await cliente.rpc('marcar_pensiones_de_con_movimientos', {
        p_usuario_id: ids.residente, p_periodos: [ACTUAL], p_montos_esperados: [30000],
      })).error?.code).toBe('42501')
    }
    const director = await clienteComo('director')
    expect((await clienteAnonimoPrueba().rpc('pensiones_de', { p_usuario_id: ids.residente, p_anio: 2026 })).error).not.toBeNull()
    expect((await admin.from('perfiles').update({ activo: false }).eq('id', ids.residente2)).error).toBeNull()
    for (const objetivo of [ids.director, ids.residente2, ids.administracion, ids.administradora, '00000000-0000-0000-0000-000000000000', null]) {
      expect((await director.rpc('pensiones_de', { p_usuario_id: objetivo, p_anio: 2026 })).error?.code).toBe('22023')
      expect((await director.rpc('marcar_pensiones_de_con_movimientos', {
        p_usuario_id: objetivo, p_periodos: [ACTUAL], p_montos_esperados: [30000],
      })).error?.code).toBe('22023')
    }
    expect((await admin.from('perfiles').update({ activo: true }).eq('id', ids.residente2)).error).toBeNull()
    expect((await admin.from('perfiles').update({ activo: false }).eq('id', ids.director)).error).toBeNull()
    expect((await director.rpc('pensiones_de', { p_usuario_id: ids.residente, p_anio: 2026 })).error?.code).toBe('42501')
  })

  it('calcula la cuota de un Residente y otro Director y aparece en historial, vista propia y presupuesto', async () => {
    const director = await clienteComo('director')
    const parcial = await registrar()
    const otroDirector = await registrar('director2', 0, 50000)
    expect(parcial.error).toBeNull()
    expect(otroDirector.error).toBeNull()
    expect(parcial.data).toHaveLength(1)
    expect(otroDirector.data).toHaveLength(1)
    const pagos = await admin.from('pensiones_pagos').select('usuario_id, registrado_por, categoria, monto_centavos, abono_centavos').order('monto_centavos')
      .in('usuario_id', [ids.residente, ids.director2])
    expect(pagos.error).toBeNull()
    expect(pagos.data).toEqual([
      { usuario_id: ids.residente, registrado_por: ids.director, categoria: 'universitario', monto_centavos: 30000, abono_centavos: 10000 },
      { usuario_id: ids.director2, registrado_por: ids.director, categoria: 'profesional', monto_centavos: 50000, abono_centavos: 50000 },
    ])
    for (const [clave, cuota, pagado] of [['residente', 30000, 10000], ['director2', 50000, 50000]] as const) {
      const cliente = await clienteComo(clave)
      const propio = await cliente.rpc('mis_pensiones', { p_anio: Number(ACTUAL.slice(0, 4)) })
      expect(propio.error).toBeNull()
      expect(propio.data.find((m: { periodo: string }) => m.periodo === ACTUAL)).toMatchObject({ monto_centavos: cuota, pagado_centavos: pagado })
      const casa = await director.rpc('pensiones_de', { p_usuario_id: ids[clave], p_anio: Number(ACTUAL.slice(0, 4)) })
      expect(casa.error).toBeNull()
      expect(casa.data).toEqual(propio.data)
      const historial = await cliente.from('pensiones_pagos').select('usuario_id, registrado_por').eq('usuario_id', ids[clave])
      expect(historial.data).toEqual([{ usuario_id: ids[clave], registrado_por: ids.director }])
      const presupuesto = await (await clienteComo('administradora')).rpc('presupuesto_pensiones', { p_periodo: ACTUAL })
      expect(presupuesto.data.find((f: { usuario_id: string }) => f.usuario_id === ids[clave])).toMatchObject({ monto_centavos: cuota, pagado_centavos: pagado })
      expect(JSON.stringify(presupuesto.data)).not.toContain('Residente Prueba')
    }
    expect((await director.rpc('marcar_pensiones_de_con_movimientos', {
      p_usuario_id: ids.residente, p_periodos: [FUTURO], p_montos_esperados: [70000],
    })).error?.code).toBe('40001')
    // RLS del Residente sigue ocultando pagos ajenos, incluida su autoría.
    expect((await (await clienteComo('residente')).from('pensiones_pagos').select('*').eq('usuario_id', ids.director2)).data).toEqual([])
  })

  it('selección de varios meses y abonos usa snapshots históricos y valida atómicamente todo el lote', async () => {
    expect((await registrar()).error).toBeNull()
    const director = await clienteComo('director')
    expect((await director.rpc('guardar_cuota_pension', {
      p_usuario_id: ids.residente, p_desde: ACTUAL, p_categoria: 'profesional', p_monto_centavos: 45000,
    })).error).toBeNull()
    expect((await director.rpc('marcar_pensiones_de_con_movimientos', {
      p_usuario_id: ids.residente, p_periodos: [ACTUAL, FUTURO], p_montos_esperados: [30000, 45000],
      p_pagados_esperados: [10000, 0], p_abonos: [20000, 45001],
    })).error?.code).toBe('22023')
    expect((await admin.from('pensiones_pagos').select('id').eq('usuario_id', ids.residente)).data).toHaveLength(1)
    const lote = await director.rpc('marcar_pensiones_de_con_movimientos', {
      p_usuario_id: ids.residente, p_periodos: [ACTUAL, FUTURO], p_montos_esperados: [30000, 45000],
      p_pagados_esperados: [10000, 0], p_abonos: [20000, 12345],
    })
    expect(lote.error).toBeNull()
    expect(lote.data).toHaveLength(2)
    const historico = await admin.from('pensiones_pagos').select('categoria, monto_centavos, abono_centavos').eq('usuario_id', ids.residente).eq('periodo', ACTUAL).order('abono_centavos')
    expect(historico.data).toEqual([
      { categoria: 'universitario', monto_centavos: 30000, abono_centavos: 10000 },
      { categoria: 'universitario', monto_centavos: 30000, abono_centavos: 20000 },
    ])
  })

  it('serializa abonos simultáneos del titular y Director, sin duplicados ni exceso de saldo', async () => {
    const residente = await clienteComo('residente')
    const resultados = await Promise.all(Array.from({ length: 10 }, (_, i) => i % 2 ? registrar() : residente.rpc('marcar_pensiones_con_movimientos', {
      p_periodos: [ACTUAL], p_montos_esperados: [30000], p_pagados_esperados: [0], p_abonos: [10000],
    })))
    expect(resultados.filter((r) => r.error === null)).toHaveLength(1)
    expect(resultados.filter((r) => r.error).every((r) => r.error?.code === '40001')).toBe(true)
    expect((await registrar('residente', 10000, 20001)).error?.code).toBe('22023')
    expect((await registrar('residente', 10000, 20000)).error).toBeNull()
    const director = await clienteComo('director')
    const repetido = await director.rpc('marcar_pensiones_de_con_movimientos', {
      p_usuario_id: ids.residente, p_periodos: [ACTUAL], p_montos_esperados: [30000],
    })
    expect(repetido.error).toBeNull()
    expect(repetido.data).toEqual([])
    expect((await residente.rpc('marcar_pensiones_con_movimientos', { p_periodos: [ACTUAL] })).data).toEqual([])
    const filas = await admin.from('pensiones_pagos').select('abono_centavos').eq('usuario_id', ids.residente)
    expect(filas.data).toHaveLength(2)
    expect(filas.data?.reduce((n, p) => n + p.abono_centavos, 0)).toBe(30000)
  })

  it('los helpers y la escritura directa permanecen inaccesibles; el autor no viene del cliente', async () => {
    for (const rol of ['director', 'residente', 'administracion', 'administradora'] as const) {
      const cliente = await clienteComo(rol)
      expect((await cliente.rpc('validar_titular_pension', { p_usuario_id: ids.residente, p_de_la_casa: true })).error?.code).toBe('42501')
      expect((await cliente.rpc('registrar_abonos_pension', {
        p_usuario_id: ids.residente, p_de_la_casa: true, p_periodos: [ACTUAL],
        p_montos_esperados: [30000], p_pagados_esperados: [0], p_abonos: [10000],
      })).error?.code).toBe('42501')
      expect((await cliente.from('pensiones_pagos').insert({
        usuario_id: ids.residente, periodo: ACTUAL, categoria: 'universitario', monto_centavos: 30000, abono_centavos: 10000, registrado_por: ids.residente,
      })).error?.code).toBe('42501')
      expect((await cliente.from('pensiones_pagos').update({ registrado_por: ids.residente }).eq('usuario_id', ids.residente)).error?.code).toBe('42501')
    }
    const propio = await (await clienteComo('residente')).rpc('marcar_pensiones_con_movimientos', { p_periodos: [ACTUAL] })
    expect(propio.error).toBeNull()
    expect((await admin.from('pensiones_pagos').select('registrado_por').eq('id', propio.data[0].pago_id).single()).data?.registrado_por).toBe(ids.residente)
  })

  it('preserva abonos reales de la cuenta exenta y rechaza pagos ficticios de cero', async () => {
    const adelantado = await registrar('director2', 0, 12500, FUTURO)
    expect(adelantado.error).toBeNull()
    expect((await admin.rpc('activar_exencion_pension', { p_usuario_id: ids.director2 })).error).toBeNull()
    const director = await clienteComo('director')
    const vista = await director.rpc('pensiones_de', { p_usuario_id: ids.director2, p_anio: Number(FUTURO.slice(0, 4)) })
    expect(vista.error).toBeNull()
    expect(vista.data.find((m: { periodo: string }) => m.periodo === FUTURO)).toMatchObject({ exento: true, monto_centavos: 0, pagado_centavos: 12500 })
    expect((await registrar('director2', 12500, 1, FUTURO)).error?.code).toBe('22023')
    expect((await registrar('director2', 0, 0)).error?.code).toBe('22023')
    expect((await registrar('director2', 0, 1)).error?.code).toBe('22023')
    expect((await admin.from('pensiones_pagos').select('abono_centavos').eq('usuario_id', ids.director2)).data).toEqual([{ abono_centavos: 12500 }])
  })

  it('avisa por siglas del titular y reserva una sola notificación por pago/dispositivo ante reintentos', async () => {
    const pago = await registrar()
    expect(pago.error).toBeNull()
    const pagoId = pago.data[0].pago_id
    expect((await admin.rpc('aviso_pago_pension', { p_pago_id: pagoId })).data).toEqual([
      { siglas: 'RP', periodo: ACTUAL, abono_centavos: 10000, completado: false },
    ])
    const dispositivo = await admin.from('suscripciones_push').insert({
      usuario_id: ids.administradora, endpoint: `${PREFIJO}destino`, p256dh: 'clave', auth: 'auth',
    }).select('id').single()
    expect(dispositivo.error).toBeNull()
    if (!dispositivo.data) throw new Error('No se pudo crear el dispositivo de prueba')
    const dispositivoId = dispositivo.data.id
    const reservas = await Promise.all(Array.from({ length: 4 }, () => admin.rpc('reservar_avisos_pago_pension', {
      p_pago_id: pagoId, p_suscripciones: [dispositivoId],
    })))
    expect(reservas.every((r) => r.error === null)).toBe(true)
    expect(reservas.flatMap((r) => r.data)).toEqual([dispositivoId])
    const reintento = await registrar()
    expect(reintento.error?.code).toBe('40001')
    expect((await admin.from('pensiones_pagos_push').select('pago_id').eq('pago_id', pagoId)).data).toHaveLength(1)
    expect((await admin.from('avisos_pago_pension_push').select('pago_id').eq('pago_id', pagoId)).data).toHaveLength(1)
  })
})
