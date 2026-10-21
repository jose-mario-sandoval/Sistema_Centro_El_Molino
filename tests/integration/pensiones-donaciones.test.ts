import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mesActual } from '@/lib/pensiones/calculos'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteAnonimoPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

const admin = clienteAdminPrueba()
let ids: Record<ClaveUsuario, string>
const ACTUAL = mesActual()
const fechaFutura = new Date(`${ACTUAL}T12:00:00Z`)
fechaFutura.setUTCMonth(fechaFutura.getUTCMonth() + 1)
const FUTURO = fechaFutura.toISOString().slice(0, 10)

async function limpiar() {
  for (const [tabla, columna] of [['pensiones_donaciones_recepciones', 'periodo'], ['pensiones_donaciones_configuracion', 'desde']]) {
    const { error } = await admin.from(tabla).delete().gte(columna, '2000-01-01')
    if (error) throw error
  }
}
async function configurar(monto = 12329, desde = ACTUAL) {
  const director = await clienteComo('director')
  expect((await director.rpc('guardar_donacion_pension', { p_desde: desde, p_monto_centavos: monto })).error).toBeNull()
}
beforeAll(async () => { ids = await asegurarUsuariosPrueba() })
beforeEach(limpiar)
afterAll(limpiar)

describe('donación mensual de toda la casa', () => {
  it('limita las tres RPC y las tablas al Director activo', async () => {
    await configurar()
    for (const rol of ['residente', 'administracion', 'administradora'] as const) {
      const cliente = await clienteComo(rol)
      expect((await cliente.rpc('guardar_donacion_pension', { p_desde: ACTUAL, p_monto_centavos: 1 })).error?.code).toBe('42501')
      expect((await cliente.rpc('recibir_donacion_pension', { p_periodo: ACTUAL, p_monto_esperado: 12329 })).error?.code).toBe('42501')
      expect((await cliente.rpc('donaciones_pensiones', { p_anio: Number(ACTUAL.slice(0, 4)) })).error?.code).toBe('42501')
      for (const tabla of ['pensiones_donaciones_configuracion', 'pensiones_donaciones_recepciones']) {
        expect((await cliente.from(tabla).select('*')).data).toEqual([])
      }
    }
    expect((await clienteAnonimoPrueba().rpc('donaciones_pensiones', { p_anio: 2026 })).error).not.toBeNull()
    const director2 = await clienteComo('director2')
    expect((await admin.from('perfiles').update({ activo: false }).eq('id', ids.director2)).error).toBeNull()
    try {
      expect((await director2.rpc('recibir_donacion_pension', { p_periodo: ACTUAL, p_monto_esperado: 12329 })).error?.code).toBe('42501')
    } finally {
      expect((await admin.from('perfiles').update({ activo: true }).eq('id', ids.director2)).error).toBeNull()
    }
  })

  it('no inventa montos y valida vigencia, año e importes', async () => {
    const director = await clienteComo('director')
    const sinConfigurar = await director.rpc('donaciones_pensiones', { p_anio: Number(ACTUAL.slice(0, 4)) })
    expect(sinConfigurar.error).toBeNull()
    expect(sinConfigurar.data).toHaveLength(12)
    expect(sinConfigurar.data.every((m: { monto_centavos: number | null }) => m.monto_centavos === null)).toBe(true)
    expect((await director.rpc('recibir_donacion_pension', { p_periodo: ACTUAL, p_monto_esperado: 1 })).error?.code).toBe('22023')
    for (const args of [
      { p_desde: '2000-01-01', p_monto_centavos: 100 },
      { p_desde: ACTUAL.slice(0, 8) + '02', p_monto_centavos: 100 },
      { p_desde: ACTUAL, p_monto_centavos: 0 },
      { p_desde: ACTUAL, p_monto_centavos: 100000001 },
    ]) expect((await director.rpc('guardar_donacion_pension', args)).error?.code).toBe('22023')
    expect((await director.rpc('donaciones_pensiones', { p_anio: 2201 })).error?.code).toBe('22023')
  })

  it('mantiene el monto hasta la vigencia siguiente y conserva lo recibido al cambiar la configuración', async () => {
    await configurar()
    const director = await clienteComo('director')
    const guardado = await director.rpc('recibir_donacion_pension', { p_periodo: ACTUAL, p_monto_esperado: 12329 })
    expect(guardado.error).toBeNull()
    expect(guardado.data[0]).toMatchObject({ periodo: ACTUAL, monto_centavos: 12329, registrado_por: ids.director, nueva: true })
    expect(guardado.data[0].recibido_en).toBeTruthy()
    await configurar(20000)
    await configurar(30000, FUTURO)
    const consulta = await director.rpc('donaciones_pensiones', { p_anio: Number(ACTUAL.slice(0, 4)) })
    expect(consulta.error).toBeNull()
    expect(consulta.data.find((m: { periodo: string }) => m.periodo === ACTUAL)).toMatchObject({ monto_centavos: 12329, registrado_por: ids.director })
    const siguiente = await director.rpc('donaciones_pensiones', { p_anio: Number(FUTURO.slice(0, 4)) })
    expect(siguiente.data.find((m: { periodo: string }) => m.periodo === FUTURO)).toMatchObject({ monto_centavos: 30000, recibido_en: null })
    const repetido = await director.rpc('recibir_donacion_pension', { p_periodo: ACTUAL, p_monto_esperado: 20000 })
    expect(repetido.error).toBeNull()
    expect(repetido.data[0]).toEqual({ ...guardado.data[0], nueva: false })
  })

  it('dos Directores concurrentes registran exactamente una recepción compartida sin pagos personales', async () => {
    await configurar()
    const directores = await Promise.all([clienteComo('director'), clienteComo('director2')])
    const antes = await admin.from('pensiones_pagos').select('id').in('usuario_id', [ids.director, ids.director2])
    const respuestas = await Promise.all(Array.from({ length: 8 }, (_, i) => directores[i % 2].rpc('recibir_donacion_pension', {
      p_periodo: ACTUAL, p_monto_esperado: 12329,
    })))
    for (const respuesta of respuestas) expect(respuesta.error).toBeNull()
    expect(respuestas.filter((r) => r.data[0].nueva)).toHaveLength(1)
    const { data, error } = await admin.from('pensiones_donaciones_recepciones').select('*')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].monto_centavos).toBe(12329)
    expect([ids.director, ids.director2]).toContain(data?.[0].registrado_por)
    for (const director of directores) {
      const consulta = await director.rpc('donaciones_pensiones', { p_anio: Number(ACTUAL.slice(0, 4)) })
      expect(consulta.data.find((m: { periodo: string }) => m.periodo === ACTUAL)).toEqual(data?.[0])
    }
    const despues = await admin.from('pensiones_pagos').select('id').in('usuario_id', [ids.director, ids.director2])
    expect(despues.data).toEqual(antes.data)
  })

  it('rechaza una confirmación de monto obsoleto sin crear recepción', async () => {
    await configurar()
    await configurar(20000)
    const director = await clienteComo('director')
    expect((await director.rpc('recibir_donacion_pension', { p_periodo: ACTUAL, p_monto_esperado: 12329 })).error?.code).toBe('40001')
    expect((await admin.from('pensiones_donaciones_recepciones').select('*')).data).toEqual([])
  })

  it('la API directa no permite configurar, alterar snapshots ni desmarcar recepciones', async () => {
    await configurar()
    const director = await clienteComo('director')
    expect((await director.rpc('recibir_donacion_pension', { p_periodo: ACTUAL, p_monto_esperado: 12329 })).error).toBeNull()
    expect((await director.from('pensiones_donaciones_configuracion').insert({ desde: FUTURO, monto_centavos: 1, modificado_por: ids.director })).error).not.toBeNull()
    expect((await director.from('pensiones_donaciones_configuracion').update({ monto_centavos: 1 }).eq('desde', ACTUAL)).error).not.toBeNull()
    expect((await director.from('pensiones_donaciones_recepciones').insert({ periodo: FUTURO, monto_centavos: 1, registrado_por: ids.director })).error).not.toBeNull()
    expect((await director.from('pensiones_donaciones_recepciones').update({ monto_centavos: 1 }).eq('periodo', ACTUAL)).error).not.toBeNull()
    expect((await director.from('pensiones_donaciones_recepciones').delete().eq('periodo', ACTUAL)).error).not.toBeNull()
  })
})
