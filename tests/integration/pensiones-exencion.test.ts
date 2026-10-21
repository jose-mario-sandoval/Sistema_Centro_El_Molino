import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fechaISOEn } from '@/lib/fechas'
import { resumenAnual } from '@/lib/pensiones/calculos'
import type { FilaPresupuesto } from '@/lib/pensiones/tipos'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

const admin = clienteAdminPrueba()
const ACTUAL = `${fechaISOEn(new Date()).slice(0, 7)}-01`
const ANIO = Number(ACTUAL.slice(0, 4))
const anterior = new Date(`${ACTUAL}T12:00:00Z`)
anterior.setUTCMonth(anterior.getUTCMonth() - 1)
const PASADO = anterior.toISOString().slice(0, 10)
const siguiente = new Date(`${ACTUAL}T12:00:00Z`)
siguiente.setUTCMonth(siguiente.getUTCMonth() + 1)
const FUTURO = siguiente.toISOString().slice(0, 10)
let ids: Record<ClaveUsuario, string>

async function limpiarExencion() {
  const { error } = await admin.from('pensiones_exencion').delete().eq('unica', true)
  if (error) throw error
}

beforeAll(async () => { ids = await asegurarUsuariosPrueba() })
beforeEach(async () => {
  await limpiarExencion()
  for (const tabla of ['pensiones_pagos', 'pensiones_cuotas', 'pensiones_participacion']) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', Object.values(ids))
    if (error) throw error
  }
  const { error: participacion } = await admin.from('pensiones_participacion').insert(
    (['director', 'director2', 'residente', 'residente2'] as const)
      .map((clave) => ({ usuario_id: ids[clave], desde: '2000-01-01', incluido: true })),
  )
  if (participacion) throw participacion
  const { error: cuotas } = await admin.from('pensiones_cuotas').insert([
    { usuario_id: ids.director2, desde: '2000-01-01', categoria: 'profesional', monto_centavos: 50000 },
    { usuario_id: ids.residente, desde: '2000-01-01', categoria: 'universitario', monto_centavos: 30000 },
  ])
  if (cuotas) throw cuotas
})
afterAll(async () => { await limpiarExencion() })

describe('exención única por UUID y con vigencia', () => {
  it('queda inactiva hasta identificar la cuenta y ningún rol de la app puede activarla o ampliarla', async () => {
    for (const rol of ['director', 'residente', 'administracion', 'administradora'] as const) {
      const cliente = await clienteComo(rol)
      expect((await cliente.rpc('activar_exencion_pension', { p_usuario_id: ids.director2 })).error).not.toBeNull()
      expect((await cliente.from('pensiones_exencion').insert({ usuario_id: ids.director2 })).error).not.toBeNull()
      expect((await cliente.rpc('pensiones_es_exento', { p_usuario_id: ids.director2, p_periodo: ACTUAL })).error).not.toBeNull()
    }
    const propio = await (await clienteComo('director2')).rpc('mis_pensiones', { p_anio: ANIO })
    expect(propio.error).toBeNull()
    expect(propio.data.find((m: { periodo: string }) => m.periodo === ACTUAL)).toMatchObject({ exento: false, monto_centavos: 50000 })
  })

  it('activa una sola identidad ante concurrencia y no modifica el mes al reintentar', async () => {
    const resultados = await Promise.all(Array.from({ length: 5 }, () => admin.rpc('activar_exencion_pension', { p_usuario_id: ids.director2 })))
    for (const resultado of resultados) {
      expect(resultado.error).toBeNull()
      expect(resultado.data).toBe(ACTUAL)
    }
    expect((await admin.rpc('activar_exencion_pension', { p_usuario_id: ids.residente })).error?.code).toBe('22023')
    const config = await admin.from('pensiones_exencion').select('*')
    expect(config.error).toBeNull()
    expect(config.data).toHaveLength(1)
    expect(config.data?.[0]).toMatchObject({ usuario_id: ids.director2, desde: ACTUAL })
    const directora = await clienteComo('director')
    expect((await directora.from('pensiones_exencion').select('usuario_id')).data).toEqual([{ usuario_id: ids.director2 }])
    for (const rol of ['residente', 'administracion', 'administradora'] as const) {
      expect((await (await clienteComo(rol)).from('pensiones_exencion').select('*')).data).toEqual([])
    }
  })

  it('mantiene historial anterior y abonos adelantados; exige cero sin inventar movimientos nuevos', async () => {
    const exento = await clienteComo('director2')
    expect((await exento.rpc('marcar_pensiones', { p_periodos: [PASADO] })).error).toBeNull()
    expect((await exento.rpc('marcar_pensiones', { p_periodos: [FUTURO], p_montos_esperados: [50000], p_pagados_esperados: [0], p_abonos: [12500] })).error).toBeNull()
    const previos = await admin.from('pensiones_pagos').select('*').eq('usuario_id', ids.director2).order('id')
    expect((await admin.rpc('activar_exencion_pension', { p_usuario_id: ids.director2 })).error).toBeNull()
    const propio = await exento.rpc('mis_pensiones', { p_anio: Number(FUTURO.slice(0, 4)) })
    expect(propio.error).toBeNull()
    expect(propio.data.find((m: { periodo: string }) => m.periodo === FUTURO)).toMatchObject({ exento: true, monto_centavos: 0, pagado_centavos: 12500 })
    const historico = await exento.rpc('mis_pensiones', { p_anio: Number(PASADO.slice(0, 4)) })
    expect(historico.data.find((m: { periodo: string }) => m.periodo === PASADO)).toMatchObject({ exento: false, monto_centavos: 50000, pagado_centavos: 50000 })
    for (const periodo of [ACTUAL, FUTURO]) {
      expect((await exento.rpc('marcar_pensiones', { p_periodos: [periodo] })).error?.code).toBe('22023')
      expect((await exento.rpc('marcar_pensiones', { p_periodos: [periodo], p_montos_esperados: [0], p_pagados_esperados: [0], p_abonos: [1] })).error?.code).toBe('22023')
      expect((await admin.from('pensiones_pagos').insert({ usuario_id: ids.director2, periodo, categoria: 'profesional', monto_centavos: 50000, abono_centavos: 1 })).error?.code).toBe('22023')
    }
    expect((await admin.from('pensiones_pagos').select('*').eq('usuario_id', ids.director2).order('id')).data).toEqual(previos.data)
    const director = await clienteComo('director')
    expect((await director.rpc('guardar_cuota_pension', { p_usuario_id: ids.director2, p_desde: FUTURO, p_categoria: 'profesional', p_monto_centavos: 50000 })).error?.code).toBe('22023')
    expect((await director.rpc('guardar_cuota_pension', { p_usuario_id: ids.residente, p_desde: ACTUAL, p_categoria: 'universitario', p_monto_centavos: 30000 })).error).toBeNull()
    expect((await (await clienteComo('residente')).rpc('marcar_pensiones', { p_periodos: [ACTUAL], p_montos_esperados: [30000], p_pagados_esperados: [0], p_abonos: [10000] })).error).toBeNull()
  })

  it('usa los mismos períodos en presupuesto mensual y anual y las demás cuentas siguen pagando', async () => {
    expect((await admin.rpc('activar_exencion_pension', { p_usuario_id: ids.director2 })).error).toBeNull()
    const directora = await clienteComo('director')
    const meses: FilaPresupuesto[][] = []
    for (let i = 1; i <= 12; i++) {
      const periodo = `${ANIO}-${String(i).padStart(2, '0')}-01`
      const resultado = await directora.rpc('presupuesto_pensiones', { p_periodo: periodo })
      expect(resultado.error).toBeNull()
      const filas = resultado.data.map((fila: Omit<FilaPresupuesto, 'periodo'>) => ({ ...fila, periodo })) as FilaPresupuesto[]
      const filaExenta = filas.find((f) => f.usuario_id === ids.director2)!
      expect(filaExenta).toMatchObject({ exento: periodo >= ACTUAL, monto_centavos: periodo >= ACTUAL ? 0 : 50000, pagado_centavos: 0 })
      expect(filas.find((f) => f.usuario_id === ids.residente)).toMatchObject({ exento: false, monto_centavos: 30000 })
      meses.push(filas)
    }
    const anual = resumenAnual(meses)
    expect(anual.personas.find((p) => p.usuario_id === ids.director2)?.meta).toBe((Number(ACTUAL.slice(5, 7)) - 1) * 50000)
    expect(anual.personas.find((p) => p.usuario_id === ids.residente)?.meta).toBe(12 * 30000)
    expect(anual.sinCuota).not.toContain('Director Dos')
    const administradora = await (await clienteComo('administradora')).rpc('presupuesto_pensiones', { p_periodo: ACTUAL })
    expect(administradora.error).toBeNull()
    expect(administradora.data.find((f: { usuario_id: string }) => f.usuario_id === ids.director2)).toMatchObject({ etiqueta: 'D2', exento: true, monto_centavos: 0 })
  })

  it('el Director exento conserva la configuración y recepción de la donación compartida', async () => {
    async function limpiarDonaciones() {
      for (const [tabla, columna] of [['pensiones_donaciones_recepciones', 'periodo'], ['pensiones_donaciones_configuracion', 'desde']]) {
        const resultado = await admin.from(tabla).delete().gte(columna, '2000-01-01')
        if (resultado.error) throw resultado.error
      }
    }
    await limpiarDonaciones()
    try {
      expect((await admin.rpc('activar_exencion_pension', { p_usuario_id: ids.director2 })).error).toBeNull()
      const director = await clienteComo('director2')
      expect((await director.rpc('guardar_donacion_pension', { p_desde: ACTUAL, p_monto_centavos: 12329 })).error).toBeNull()
      expect((await director.rpc('recibir_donacion_pension', { p_periodo: ACTUAL, p_monto_esperado: 12329 })).error).toBeNull()
      const recepcion = await admin.from('pensiones_donaciones_recepciones').select('periodo, monto_centavos, registrado_por').eq('periodo', ACTUAL).single()
      expect(recepcion.error).toBeNull()
      expect(recepcion.data).toMatchObject({ periodo: ACTUAL, monto_centavos: 12329, registrado_por: ids.director2 })
      expect((await admin.from('pensiones_pagos').select('id').eq('usuario_id', ids.director2)).data).toEqual([])
    } finally {
      await limpiarDonaciones()
    }
  })
})
