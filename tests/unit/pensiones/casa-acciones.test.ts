import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { marcarPensionesDe } from '@/app/(app)/pensiones/acciones'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { avisarPagoPension } from '@/lib/push/avisos-pensiones'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { clienteSupabaseFalso, perfilDePrueba } from '@/tests/soporte/supabase-falso'

vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))
vi.mock('@/lib/push/avisos-pensiones', () => ({ avisarPagoPension: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))

const DIRECTOR = '0b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
const TITULAR = '1b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
const entrada = { usuario_id: TITULAR, periodos: ['2099-01-01'], montos: [30000] }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: perfilDePrueba(DIRECTOR, 'director') })
})

describe('registro de pensiones de otras personas', () => {
  it.each(['residente', 'administracion', 'administradora'])('exige Director antes de acceder a datos: %s', async () => {
    vi.mocked(perfilParaAccion).mockResolvedValue({ ok: false, error: 'Sin permiso' })
    expect(await marcarPensionesDe(entrada)).toEqual({ ok: false, error: 'Sin permiso' })
    expect(perfilParaAccion).toHaveBeenCalledWith('director')
    expect(crearClienteServidor).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
  })

  it.each([DIRECTOR, 'no-es-uuid', '', null])('rechaza el propio Director o una identidad inválida antes de consultar: %s', async (usuario_id) => {
    expect((await marcarPensionesDe({ ...entrada, usuario_id })).ok).toBe(false)
    expect(crearClienteServidor).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each([
    null,
    { id: TITULAR, rol: 'residente', activo: false },
    { id: TITULAR, rol: 'director', activo: false },
    { id: TITULAR, rol: 'administracion', activo: true },
    { id: TITULAR, rol: 'administradora', activo: true },
  ])('rechaza un titular inexistente, inactivo o sin pensión: %j', async (persona) => {
    const falso = clienteSupabaseFalso({ consultas: [{ data: persona, error: null }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect((await marcarPensionesDe(entrada)).ok).toBe(false)
    expect(falso.operaciones).toEqual([{
      tabla: 'perfiles', operacion: 'select', columnas: 'id, activo, rol', filtros: [['id', TITULAR]],
    }])
    expect(falso.rpcs).toEqual([])
    expect(after).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('un fallo al comprobar el titular impide escribir y notificar', async () => {
    const falso = clienteSupabaseFalso({ consultas: [{ data: { id: TITULAR, rol: 'residente', activo: true }, error: { message: 'Sin conexión' } }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect((await marcarPensionesDe(entrada)).ok).toBe(false)
    expect(falso.rpcs).toEqual([])
    expect(after).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it.each(['residente', 'director'])('registra para un %s activo sin aceptar categoría ni autor del navegador', async (rol) => {
    const falso = clienteSupabaseFalso({
      consultas: [{ data: { id: TITULAR, rol, activo: true }, error: null }],
      rpc: [{ data: [{ pago_id: 'nuevo' }], error: null }],
    })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect(await marcarPensionesDe({ ...entrada, categoria: 'falsa', registrado_por: 'impostor', monto_centavos: 1 }))
      .toEqual({ ok: true, data: { cantidad: 1 } })
    expect(falso.rpcs).toEqual([{
      nombre: 'marcar_pensiones_de_con_movimientos',
      args: { p_usuario_id: TITULAR, p_periodos: entrada.periodos, p_montos_esperados: entrada.montos },
    }])
    expect(revalidatePath).toHaveBeenCalledWith('/pensiones', 'layout')
    expect(after).toHaveBeenCalledOnce()
    expect(avisarPagoPension).not.toHaveBeenCalled()
    await (vi.mocked(after).mock.calls[0][0] as () => Promise<void>)()
    expect(avisarPagoPension).toHaveBeenCalledExactlyOnceWith('nuevo')
  })

  it('conserva la correspondencia de períodos, cuotas, pagados y abonos de varios meses', async () => {
    const falso = clienteSupabaseFalso({
      consultas: [{ data: { id: TITULAR, rol: 'residente', activo: true }, error: null }],
      rpc: [{ data: [{ pago_id: 'nuevo-enero' }, { pago_id: 'nuevo-marzo' }], error: null }],
    })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    const datos = { ...entrada, periodos: ['2099-01-01', '2099-03-01'], montos: [30000, 40000], pagados: [10000, 0], abonos: [5000, 40000] }
    expect(await marcarPensionesDe(datos)).toEqual({ ok: true, data: { cantidad: 2 } })
    expect(falso.rpcs[0].args).toEqual({
      p_usuario_id: TITULAR, p_periodos: datos.periodos, p_montos_esperados: datos.montos,
      p_pagados_esperados: datos.pagados, p_abonos: datos.abonos,
    })
    await (vi.mocked(after).mock.calls[0][0] as () => Promise<void>)()
    expect(vi.mocked(avisarPagoPension).mock.calls).toEqual([['nuevo-enero'], ['nuevo-marzo']])
  })

  it.each([
    { periodos: ['2099-01-01', '2099-01-01'], montos: [30000, 30000] },
    { periodos: [], montos: [] },
    { pagados: [0], abonos: [0] },
    { abonos: [5000] },
    { periodos: ['2099-01-01', '2099-02-01'], montos: [30000] },
    { pagados: [0, 0], abonos: [1] },
    { montos: [0] },
  ])('comparte las validaciones del pago propio: %j', async (cambios) => {
    expect((await marcarPensionesDe({ ...entrada, ...cambios })).ok).toBe(false)
    expect(crearClienteServidor).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
  })

  it.each([
    { data: null, error: { code: '40001' } },
    { data: null, error: null },
    { data: [{ pago_id: 'sin-confirmar' }], error: { code: 'MOL01' } },
  ])('una respuesta fallida de SQL no notifica ni revalida: %j', async (respuesta) => {
    const falso = clienteSupabaseFalso({
      consultas: [{ data: { id: TITULAR, rol: 'residente', activo: true }, error: null }], rpc: [respuesta],
    })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect((await marcarPensionesDe(entrada)).ok).toBe(false)
    expect(after).not.toHaveBeenCalled()
    expect(avisarPagoPension).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('un reintento sin movimientos nuevos refresca la vista sin repetir notificaciones', async () => {
    const falso = clienteSupabaseFalso({
      consultas: [{ data: { id: TITULAR, rol: 'residente', activo: true }, error: null }], rpc: [{ data: [], error: null }],
    })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect(await marcarPensionesDe(entrada)).toEqual({ ok: true, data: { cantidad: 0 } })
    expect(after).not.toHaveBeenCalled()
    expect(revalidatePath).toHaveBeenCalledWith('/pensiones', 'layout')
  })
})
