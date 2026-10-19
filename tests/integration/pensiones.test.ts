import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fechaISOEn } from '@/lib/fechas'
import {
  asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, clienteAnonimoPrueba,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'

const admin = clienteAdminPrueba()
let ids: Record<ClaveUsuario, string>
const ACTUAL = `${fechaISOEn(new Date()).slice(0, 7)}-01`
function mesRelativo(delta: number) {
  const fecha = new Date(`${ACTUAL}T12:00:00Z`)
  fecha.setUTCMonth(fecha.getUTCMonth() + delta)
  return fecha.toISOString().slice(0, 10)
}
const PASADO = mesRelativo(-1)
const FUTURO = mesRelativo(1)

async function cuota(usuario: ClaveUsuario, monto = 30000, desde = ACTUAL, categoria = 'universitario') {
  const director = await clienteComo('director')
  const resultado = await director.rpc('guardar_cuota_pension', {
    p_usuario_id: ids[usuario], p_desde: desde, p_categoria: categoria, p_monto_centavos: monto,
  })
  expect(resultado.error).toBeNull()
}

async function presupuesto(periodo: string, rol: 'director' | 'administradora' = 'director') {
  const cliente = await clienteComo(rol)
  const { data, error } = await cliente.rpc('presupuesto_pensiones', { p_periodo: periodo })
  expect(error).toBeNull()
  return data as { usuario_id: string; etiqueta: string; monto_centavos: number | null; pagado_centavos: number; categoria: string | null }[]
}

beforeAll(async () => { ids = await asegurarUsuariosPrueba() })
beforeEach(async () => {
  const restaurar = await admin.from('perfiles').update({ activo: true, rol: 'residente' }).eq('id', ids.residente)
  if (restaurar.error) throw restaurar.error
  for (const tabla of ['pensiones_pagos', 'pensiones_cuotas', 'pensiones_participacion']) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', Object.values(ids))
    if (error) throw error
  }
  const { error } = await admin.from('pensiones_participacion').insert(
    (['director', 'director2', 'residente', 'residente2'] as const)
      .map((clave) => ({ usuario_id: ids[clave], desde: PASADO, incluido: true })),
  )
  if (error) throw error
})

describe('Pensiones: autorización y datos históricos', () => {
  it('solo el Director edita cuotas, con vigencia actual o futura y montos enteros válidos', async () => {
    for (const rol of ['residente', 'administradora', 'administracion'] as const) {
      const cliente = await clienteComo(rol)
      const { error } = await cliente.rpc('guardar_cuota_pension', {
        p_usuario_id: ids.residente, p_desde: ACTUAL, p_categoria: 'universitario', p_monto_centavos: 30000,
      })
      expect(error?.code).toBe('42501')
    }
    const director = await clienteComo('director')
    for (const cambio of [
      { p_desde: PASADO }, { p_desde: ACTUAL.slice(0, 8) + '02' },
      { p_categoria: 'residente' }, { p_monto_centavos: 0 }, { p_monto_centavos: 100000001 },
    ]) {
      const { error } = await director.rpc('guardar_cuota_pension', {
        p_usuario_id: ids.residente, p_desde: ACTUAL, p_categoria: 'universitario', p_monto_centavos: 30000, ...cambio,
      })
      expect(error).not.toBeNull()
    }
    await cuota('director', 50000, ACTUAL, 'profesional')
    await cuota('residente', 30000)
  })

  it('Administración, anónimos e inactivos no acceden a Pensiones; Administradora no marca pagos', async () => {
    const administracion = await clienteComo('administracion')
    for (const rpc of ['mis_pensiones', 'presupuesto_pensiones', 'marcar_pensiones']) {
      const args = rpc === 'mis_pensiones' ? { p_anio: Number(ACTUAL.slice(0, 4)) }
        : rpc === 'presupuesto_pensiones' ? { p_periodo: ACTUAL } : { p_periodos: [ACTUAL] }
      expect((await administracion.rpc(rpc, args)).error?.code).toBe('42501')
    }
    for (const tabla of ['pensiones_cuotas', 'pensiones_pagos']) {
      expect((await administracion.from(tabla).select('*')).data).toEqual([])
    }
    expect((await clienteAnonimoPrueba().rpc('mis_pensiones', { p_anio: 2026 })).error).not.toBeNull()
    const administradora = await clienteComo('administradora')
    expect((await administradora.rpc('marcar_pensiones', { p_periodos: [ACTUAL] })).error?.code).toBe('42501')
    expect((await administradora.rpc('mis_pensiones', { p_anio: 2026 })).error?.code).toBe('42501')
    const residente = await clienteComo('residente')
    const desactivar = await admin.from('perfiles').update({ activo: false }).eq('id', ids.residente)
    expect(desactivar.error).toBeNull()
    expect((await residente.rpc('mis_pensiones', { p_anio: 2026 })).error?.code).toBe('42501')
  })

  it('una categoría admite cuotas individuales diferentes y ninguna cuota se inventa', async () => {
    await cuota('residente', 30000)
    await cuota('residente2', 40000)
    const filas = await presupuesto(ACTUAL)
    expect(filas.find((f) => f.usuario_id === ids.residente)?.monto_centavos).toBe(30000)
    expect(filas.find((f) => f.usuario_id === ids.residente2)?.monto_centavos).toBe(40000)
    expect(filas.find((f) => f.usuario_id === ids.director)?.monto_centavos).toBeNull()
    const director = await clienteComo('director')
    expect((await director.rpc('marcar_pensiones', { p_periodos: [ACTUAL] })).error?.code).toBe('22023')
    expect((await director.from('pensiones_pagos').select('*').eq('usuario_id', ids.director)).data).toEqual([])
  })

  it('los pagos se registran exclusivamente para quien tiene la sesión, incluidos los del Director', async () => {
    await cuota('residente')
    await cuota('director', 50000, ACTUAL, 'profesional')
    const residente = await clienteComo('residente')
    const { data, error } = await residente.rpc('marcar_pensiones', { p_periodos: [ACTUAL] })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({ usuario_id: ids.residente, categoria: 'universitario', monto_centavos: 30000 })
    const director = await clienteComo('director')
    const propio = await director.rpc('marcar_pensiones', { p_periodos: [ACTUAL] })
    expect(propio.error).toBeNull()
    expect(propio.data[0].usuario_id).toBe(ids.director)
    for (const cliente of [residente, director]) {
      expect((await cliente.from('pensiones_pagos').insert({
        usuario_id: ids.residente2, periodo: ACTUAL, categoria: 'profesional', monto_centavos: 1,
      })).error).not.toBeNull()
      expect((await cliente.from('pensiones_pagos').update({ monto_centavos: 1 }).eq('usuario_id', ids.residente)).error).not.toBeNull()
      expect((await cliente.from('pensiones_pagos').delete().eq('usuario_id', ids.residente)).error).not.toBeNull()
    }
    expect((await (await clienteComo('residente2')).from('pensiones_pagos').select('*')).data).toEqual([])
  })

  it('reintentos y solicitudes simultáneas producen un único pago por persona y mes', async () => {
    await cuota('residente')
    const residente = await clienteComo('residente')
    const resultados = await Promise.all(Array.from({ length: 5 }, () => residente.rpc('marcar_pensiones', {
      p_periodos: [ACTUAL, FUTURO], p_montos_esperados: [30000, 30000],
    })))
    for (const resultado of resultados) {
      expect(resultado.error).toBeNull()
      expect(resultado.data).toHaveLength(2)
    }
    const { data } = await admin.from('pensiones_pagos').select('*').eq('usuario_id', ids.residente)
    expect(data).toHaveLength(2)
    expect(data?.reduce((s, fila) => s + fila.monto_centavos, 0)).toBe(60000)
  })

  it('el lote es atómico ante un mes sin cuota o una cuota que cambió tras confirmar', async () => {
    await cuota('residente')
    const residente = await clienteComo('residente')
    expect((await residente.rpc('marcar_pensiones', { p_periodos: [ACTUAL, PASADO] })).error?.code).toBe('22023')
    await cuota('residente', 40000, FUTURO)
    expect((await residente.rpc('marcar_pensiones', {
      p_periodos: [ACTUAL, FUTURO], p_montos_esperados: [30000, 30000],
    })).error?.code).toBe('40001')
    const { data } = await admin.from('pensiones_pagos').select('*').eq('usuario_id', ids.residente)
    expect(data).toEqual([])
  })

  it('los pagos adelantados conservan monto y categoría originales aunque cambie su cuota', async () => {
    await cuota('residente')
    const residente = await clienteComo('residente')
    expect((await residente.rpc('marcar_pensiones', { p_periodos: [FUTURO] })).error).toBeNull()
    await cuota('residente', 45000, FUTURO, 'profesional')
    const filas = await presupuesto(FUTURO)
    expect(filas.find((f) => f.usuario_id === ids.residente)).toMatchObject({
      categoria: 'universitario', monto_centavos: 30000, pagado_centavos: 30000,
    })
    const anio = await residente.rpc('mis_pensiones', { p_anio: Number(FUTURO.slice(0, 4)) })
    expect(anio.error).toBeNull()
    expect(anio.data).toHaveLength(12)
    expect(anio.data.find((f: { periodo: string }) => f.periodo === FUTURO)).toMatchObject({
      monto_centavos: 30000, pagado_centavos: 30000, categoria: 'universitario',
    })
  })

  it('cuotas, desactivación, cambios de rol y reactivación conservan las metas pasadas sin pagos', async () => {
    expect((await admin.from('pensiones_cuotas').insert({
      usuario_id: ids.residente, desde: PASADO, categoria: 'universitario', monto_centavos: 30000,
    })).error).toBeNull()
    await cuota('residente', 45000, ACTUAL, 'profesional')
    for (const cambio of [{ activo: false }, { activo: true, rol: 'administradora' }, { activo: true, rol: 'residente' }]) {
      expect((await admin.from('perfiles').update(cambio).eq('id', ids.residente)).error).toBeNull()
      const pasado = await presupuesto(PASADO)
      expect(pasado.find((f) => f.usuario_id === ids.residente)).toMatchObject({ monto_centavos: 30000, pagado_centavos: 0 })
    }
  })

  it('el presupuesto asigna adelantos al período pagado y respeta nombres o siglas según rol', async () => {
    await cuota('residente')
    const residente = await clienteComo('residente')
    expect((await residente.rpc('marcar_pensiones', { p_periodos: [FUTURO] })).error).toBeNull()
    expect((await presupuesto(ACTUAL)).find((f) => f.usuario_id === ids.residente)?.pagado_centavos).toBe(0)
    expect((await presupuesto(FUTURO)).find((f) => f.usuario_id === ids.residente)?.pagado_centavos).toBe(30000)
    const director = await presupuesto(ACTUAL)
    const administradora = await presupuesto(ACTUAL, 'administradora')
    expect(director.find((f) => f.usuario_id === ids.residente)?.etiqueta).toBe('Residente Prueba')
    expect(administradora.find((f) => f.usuario_id === ids.residente)?.etiqueta).toBe('RP')
    expect(JSON.stringify(administradora)).not.toContain('Residente Prueba')
    expect(JSON.stringify(administradora)).not.toContain('Directora Prueba')
    expect((await residente.rpc('presupuesto_pensiones', { p_periodo: ACTUAL })).error?.code).toBe('42501')
    const clienteAdministradora = await clienteComo('administradora')
    expect((await clienteAdministradora.from('pensiones_cuotas').select('*')).data).toEqual([])
    expect((await clienteAdministradora.from('pensiones_pagos').select('*')).data).toEqual([])
  })
})
