import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mesActual, resumenAnual, resumenPresupuesto } from '@/lib/pensiones/calculos'
import type { FilaPresupuesto } from '@/lib/pensiones/tipos'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteAnonimoPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

const admin = clienteAdminPrueba()
const ACTUAL = mesActual()
let ids: Record<ClaveUsuario, string>

async function limpiar() {
  for (const [tabla, columna] of [
    ['pensiones_donaciones_recepciones', 'periodo'],
    ['pensiones_donaciones_configuracion', 'desde'],
  ]) {
    const { error } = await admin.from(tabla).delete().gte(columna, '2000-01-01')
    if (error) throw error
  }
  const { error: exencion } = await admin.from('pensiones_exencion').delete().eq('unica', true)
  if (exencion) throw exencion
  for (const tabla of ['pensiones_pagos', 'pensiones_cuotas', 'pensiones_participacion']) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', Object.values(ids))
    if (error) throw error
  }
}

async function presupuesto(periodo: string, rol: 'director' | 'director2' | 'administradora' = 'director'): Promise<FilaPresupuesto[]> {
  const { data, error } = await (await clienteComo(rol)).rpc('presupuesto_pensiones', { p_periodo: periodo })
  expect(error).toBeNull()
  return data.map((fila: Omit<FilaPresupuesto, 'periodo'>) => ({ ...fila, periodo })) as FilaPresupuesto[]
}

async function configurar(monto = 20000) {
  expect((await (await clienteComo('director')).rpc('guardar_donacion_pension', {
    p_desde: ACTUAL, p_monto_centavos: monto,
  })).error).toBeNull()
}

beforeAll(async () => { ids = await asegurarUsuariosPrueba() })
beforeEach(async () => {
  await limpiar()
  const { error: participacion } = await admin.from('pensiones_participacion').insert(
    (['director', 'director2', 'residente', 'residente2'] as const)
      .map((clave) => ({ usuario_id: ids[clave], desde: '2000-01-01', incluido: true })),
  )
  if (participacion) throw participacion
  const { error: cuota } = await admin.from('pensiones_cuotas').insert({
    usuario_id: ids.residente, desde: '2000-01-01', categoria: 'universitario', monto_centavos: 100000,
  })
  if (cuota) throw cuota
})
afterAll(limpiar)

describe('presupuesto con ingresos por donaciones como concepto de la casa', () => {
  it('muestra una sola fila independiente incluso sin configuración y conserva los permisos del presupuesto', async () => {
    for (const rol of ['director', 'director2', 'administradora'] as const) {
      const filas = await presupuesto(ACTUAL, rol)
      expect(filas.filter((f) => f.concepto === 'donacion')).toEqual([{
        concepto: 'donacion', usuario_id: null, etiqueta: 'Ingresos por donaciones', categoria: null,
        monto_centavos: null, pagado_centavos: 0, registrado_en: null, exento: false, periodo: ACTUAL,
      }])
      expect(filas.filter((f) => f.concepto === 'pension').every((f) => f.usuario_id !== null)).toBe(true)
    }
    for (const rol of ['residente', 'administracion'] as const) {
      expect((await (await clienteComo(rol)).rpc('presupuesto_pensiones', { p_periodo: ACTUAL })).error?.code).toBe('42501')
    }
    expect((await clienteAnonimoPrueba().rpc('presupuesto_pensiones', { p_periodo: ACTUAL })).error).not.toBeNull()
  })

  it('suma lo esperado una vez y al recibir actualiza ejecutado, pendiente y porcentaje con abonos parciales intactos', async () => {
    await configurar()
    expect((await (await clienteComo('residente')).rpc('marcar_pensiones', {
      p_periodos: [ACTUAL], p_montos_esperados: [100000], p_pagados_esperados: [0], p_abonos: [60000],
    })).error).toBeNull()
    const antes = await presupuesto(ACTUAL, 'administradora')
    expect(resumenPresupuesto(antes)).toEqual({ meta: 120000, pagado: 60000, falta: 60000, porcentaje: 50 })
    expect(antes.find((f) => f.concepto === 'donacion')).toMatchObject({ monto_centavos: 20000, pagado_centavos: 0, registrado_en: null })
    const recepcion = await (await clienteComo('director')).rpc('recibir_donacion_pension', { p_periodo: ACTUAL, p_monto_esperado: 20000 })
    expect(recepcion.error).toBeNull()
    const despues = await presupuesto(ACTUAL, 'administradora')
    expect(resumenPresupuesto(despues)).toEqual({ meta: 120000, pagado: 80000, falta: 40000, porcentaje: 80000 / 120000 * 100 })
    expect(despues.find((f) => f.concepto === 'donacion')).toMatchObject({ monto_centavos: 20000, pagado_centavos: 20000, registrado_en: recepcion.data[0].recibido_en })
    expect(despues.find((f) => f.usuario_id === ids.residente)).toMatchObject({ monto_centavos: 100000, pagado_centavos: 60000 })
    expect((await admin.from('pensiones_pagos').select('abono_centavos').eq('usuario_id', ids.residente)).data).toEqual([{ abono_centavos: 60000 }])
  })

  it('Directores simultáneos comparten exactamente un ingreso y las mismas cifras', async () => {
    await configurar()
    const directores = await Promise.all([clienteComo('director'), clienteComo('director2')])
    const respuestas = await Promise.all(Array.from({ length: 8 }, (_, i) => directores[i % 2].rpc('recibir_donacion_pension', {
      p_periodo: ACTUAL, p_monto_esperado: 20000,
    })))
    for (const respuesta of respuestas) expect(respuesta.error).toBeNull()
    expect(respuestas.filter((r) => r.data[0].nueva)).toHaveLength(1)
    const filas = await presupuesto(ACTUAL)
    expect(resumenPresupuesto(filas)).toMatchObject({ meta: 120000, pagado: 20000, falta: 100000 })
    expect(filas.filter((f) => f.concepto === 'donacion')).toHaveLength(1)
    expect(await presupuesto(ACTUAL, 'director2')).toEqual(filas)
    expect((await admin.from('pensiones_donaciones_recepciones').select('periodo').eq('periodo', ACTUAL)).data).toHaveLength(1)
    expect((await admin.from('pensiones_pagos').select('id')).data).toEqual([])
  })

  it('Administradora consulta siglas y el concepto económico sin recibir autor ni adquirir configuración o recepción', async () => {
    await configurar()
    expect((await (await clienteComo('director2')).rpc('recibir_donacion_pension', { p_periodo: ACTUAL, p_monto_esperado: 20000 })).error).toBeNull()
    const administradora = await clienteComo('administradora')
    const filas = await presupuesto(ACTUAL, 'administradora')
    expect(filas.find((f) => f.usuario_id === ids.residente)?.etiqueta).toBe('RP')
    expect(filas.find((f) => f.concepto === 'donacion')).toMatchObject({ usuario_id: null, etiqueta: 'Ingresos por donaciones', pagado_centavos: 20000 })
    expect(JSON.stringify(filas)).not.toMatch(/Directora Prueba|Director Dos|Residente Prueba|registrado_por|nombre/)
    for (const tabla of ['pensiones_donaciones_configuracion', 'pensiones_donaciones_recepciones']) {
      expect((await administradora.from(tabla).select('*')).data).toEqual([])
    }
    expect((await administradora.rpc('guardar_donacion_pension', { p_desde: ACTUAL, p_monto_centavos: 1 })).error?.code).toBe('42501')
    expect((await administradora.rpc('recibir_donacion_pension', { p_periodo: ACTUAL, p_monto_esperado: 20000 })).error?.code).toBe('42501')
  })

  it('incorpora recepciones guardadas y conserva sus montos aunque difieran de la configuración actual', async () => {
    expect((await admin.from('pensiones_donaciones_configuracion').insert([
      { desde: '2000-01-01', monto_centavos: 20000, modificado_por: ids.director },
      { desde: '2024-03-01', monto_centavos: 30000, modificado_por: ids.director2 },
    ])).error).toBeNull()
    const recibidoEn = '2025-08-15T18:00:00+00:00'
    expect((await admin.from('pensiones_donaciones_recepciones').insert({
      periodo: '2024-02-01', monto_centavos: 17000, recibido_en: recibidoEn, registrado_por: ids.director,
    })).error).toBeNull()
    expect((await admin.from('pensiones_pagos').insert({
      usuario_id: ids.residente, periodo: '2024-01-01', categoria: 'universitario', monto_centavos: 100000, abono_centavos: 45000,
    })).error).toBeNull()
    const historialAntes = await admin.from('pensiones_donaciones_recepciones').select('*')
    for (const rol of ['director', 'administradora'] as const) {
      const febrero = await presupuesto('2024-02-01', rol)
      expect(febrero.find((f) => f.concepto === 'donacion')).toMatchObject({ monto_centavos: 17000, pagado_centavos: 17000, registrado_en: recibidoEn })
      expect((await presupuesto('2024-03-01', rol)).find((f) => f.concepto === 'donacion')).toMatchObject({ monto_centavos: 30000, pagado_centavos: 0 })
      const anual = resumenAnual(await Promise.all(Array.from({ length: 12 }, (_, i) => presupuesto(`2024-${String(i + 1).padStart(2, '0')}-01`, rol))))
      expect(anual.donaciones).toMatchObject({ meta: 337000, pagado: 17000, falta: 320000 })
      expect(anual.total).toMatchObject({ meta: 1537000, pagado: 62000, falta: 1475000 })
      expect(anual.personas.find((p) => p.usuario_id === ids.residente)).toMatchObject({ meta: 1200000, pagado: 45000, falta: 1155000 })
      expect(anual.personas).toHaveLength(4)
      expect(anual.personas.every((p) => p.usuario_id !== null && p.etiqueta !== 'Ingresos por donaciones')).toBe(true)
      expect(anual.sinCuota).not.toContain('Ingresos por donaciones')
    }
    expect((await admin.from('pensiones_donaciones_recepciones').select('*')).data).toEqual(historialAntes.data)
  })

  it('conserva una recepción histórica incluso sin configuración y la asigna al período registrado', async () => {
    expect((await admin.from('pensiones_donaciones_recepciones').insert({
      periodo: '2023-07-01', monto_centavos: 17321, recibido_en: '2026-10-01T12:00:00+00:00', registrado_por: ids.director2,
    })).error).toBeNull()
    expect((await presupuesto('2023-07-01', 'administradora')).find((f) => f.concepto === 'donacion')).toMatchObject({ monto_centavos: 17321, pagado_centavos: 17321 })
    expect((await presupuesto('2026-10-01', 'administradora')).find((f) => f.concepto === 'donacion')).toMatchObject({ monto_centavos: null, pagado_centavos: 0 })
  })

  it('mantiene la exención y abonos históricos independientes del ingreso compartido', async () => {
    expect((await admin.from('pensiones_cuotas').insert({ usuario_id: ids.director2, desde: '2000-01-01', categoria: 'profesional', monto_centavos: 50000 })).error).toBeNull()
    expect((await admin.from('pensiones_pagos').insert({ usuario_id: ids.director2, periodo: ACTUAL, categoria: 'profesional', monto_centavos: 50000, abono_centavos: 10000 })).error).toBeNull()
    expect((await admin.rpc('activar_exencion_pension', { p_usuario_id: ids.director2 })).error).toBeNull()
    await configurar()
    expect((await (await clienteComo('director2')).rpc('recibir_donacion_pension', { p_periodo: ACTUAL, p_monto_esperado: 20000 })).error).toBeNull()
    const filas = await presupuesto(ACTUAL, 'administradora')
    expect(filas.find((f) => f.usuario_id === ids.director2)).toMatchObject({ concepto: 'pension', etiqueta: 'D2', exento: true, monto_centavos: 0, pagado_centavos: 10000 })
    expect(filas.find((f) => f.concepto === 'donacion')).toMatchObject({ monto_centavos: 20000, pagado_centavos: 20000, exento: false })
    expect(resumenPresupuesto(filas)).toMatchObject({ meta: 120000, pagado: 30000, falta: 90000 })
  })
})
