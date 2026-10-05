import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  crearEvento,
  crearSerieEventos,
  editarEvento,
  eliminarEvento,
  eliminarSerieDesdeHoy,
} from '@/app/(app)/calendario/acciones'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { avisarPedidoCocina, avisarSerieCocina } from '@/lib/push/avisos-casa'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { clienteSupabaseFalso, perfilDePrueba } from '@/tests/soporte/supabase-falso'

// Sin base: sesión, cliente de Supabase, caché de Next, after() y los avisos se reemplazan.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))
vi.mock('@/lib/push/avisos-casa', () => ({ avisarPedidoCocina: vi.fn(), avisarSerieCocina: vi.fn() }))

const { after } = await import('next/server')

const DIRECTOR = perfilDePrueba('0b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', 'director')
const ID = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'
const SERIE = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

function usarCliente(falso: ReturnType<typeof clienteSupabaseFalso>) {
  vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
  return falso
}

async function correrAfter() {
  for (const [tarea] of vi.mocked(after).mock.calls) await (tarea as () => Promise<void>)()
}

function formulario(campos: Record<string, string | string[]>) {
  const datos = new FormData()
  for (const [clave, valor] of Object.entries(campos)) {
    for (const v of Array.isArray(valor) ? valor : [valor]) datos.append(clave, v)
  }
  return datos
}

const EVENTO = {
  titulo: 'Cumpleaños de Juan Pérez',
  fecha: '2099-01-15',
  hora: '15:00',
  tipo: 'san_rafael',
  requiere_cocina: ['merienda'],
  requiere_otro_texto: '20 sillas',
}
const PARA_COCINA = { fecha: '2099-01-15', hora: '15:00', tipo: 'san_rafael', requiere_cocina: ['merienda'], requiere_otro_texto: '20 sillas' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: DIRECTOR })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('avisos a la cocina desde el calendario: solo cuándo, categoría y qué; nunca el título', () => {
  it('crear un evento con pedido avisa con su categoría y sin título', async () => {
    usarCliente(clienteSupabaseFalso({ consultas: [{ data: { id: ID }, error: null }] }))
    expect(await crearEvento(null, formulario(EVENTO))).toEqual({ ok: true, data: { id: ID } })
    await correrAfter()
    expect(avisarPedidoCocina).toHaveBeenCalledWith({ actorId: DIRECTOR.id, eventoId: ID, antes: null, despues: PARA_COCINA })
  })

  it('crear un evento sin pedido no programa nada', async () => {
    usarCliente(clienteSupabaseFalso({ consultas: [{ data: { id: ID }, error: null }] }))
    await crearEvento(null, formulario({ ...EVENTO, requiere_cocina: [], requiere_otro_texto: '' }))
    expect(after).not.toHaveBeenCalled()
  })

  it('editar lee antes el evento para decir qué cambió', async () => {
    const falso = usarCliente(
      clienteSupabaseFalso({
        consultas: [
          { data: { fecha: '2099-01-15', hora: '15:00:00', tipo: 'san_miguel', requiere_cocina: ['merienda'], requiere_otro_texto: null }, error: null },
          { data: [{ id: ID }], error: null },
        ],
      }),
    )
    expect(await editarEvento(null, formulario({ ...EVENTO, id: ID, hora: '16:00' }))).toEqual({ ok: true, data: null })
    expect(falso.operaciones.map((o) => o.operacion)).toEqual(['select', 'update'])
    expect(falso.operaciones[0].columnas).toBe('fecha, hora, tipo, requiere_cocina, requiere_otro_texto')
    await correrAfter()
    expect(avisarPedidoCocina).toHaveBeenCalledWith({
      actorId: DIRECTOR.id,
      eventoId: ID,
      antes: { fecha: '2099-01-15', hora: '15:00:00', tipo: 'san_miguel', requiere_cocina: ['merienda'], requiere_otro_texto: null },
      despues: { ...PARA_COCINA, hora: '16:00' },
    })
  })

  it('si no se pudo leer cómo estaba, la edición se guarda igual y no avisa', async () => {
    const falso = usarCliente(
      clienteSupabaseFalso({ consultas: [{ data: null, error: { code: '08006' } }, { data: [{ id: ID }], error: null }] }),
    )
    const consola = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await editarEvento(null, formulario({ ...EVENTO, id: ID }))).toEqual({ ok: true, data: null })
    expect(falso.operaciones.map((o) => o.operacion)).toEqual(['select', 'update'])
    expect(after).not.toHaveBeenCalled()
    consola.mockRestore()
  })

  it('borrar avisa con lo que tenía el evento borrado', async () => {
    const falso = usarCliente(
      clienteSupabaseFalso({
        consultas: [
          { data: [{ id: ID, fecha: '2099-01-15', hora: null, tipo: 'san_gabriel', requiere_cocina: [], requiere_otro_texto: 'Sillas' }], error: null },
        ],
      }),
    )
    expect(await eliminarEvento({ id: ID })).toEqual({ ok: true, data: null })
    expect(falso.operaciones[0].columnas).toBe('id, fecha, hora, tipo, requiere_cocina, requiere_otro_texto')
    await correrAfter()
    expect(avisarPedidoCocina).toHaveBeenCalledWith({
      actorId: DIRECTOR.id,
      eventoId: ID,
      antes: { fecha: '2099-01-15', hora: null, tipo: 'san_gabriel', requiere_cocina: [], requiere_otro_texto: 'Sillas' },
      despues: null,
    })
  })

  it('una serie con pedido: un solo aviso con todas sus fechas', async () => {
    usarCliente(clienteSupabaseFalso({ rpc: [{ data: SERIE, error: null }] }))
    const resultado = await crearSerieEventos(
      null,
      formulario({
        titulo: 'Retiro',
        hora: '',
        tipo: 'otro',
        requiere_cocina: ['comida'],
        requiere_otro_texto: '',
        patron: 'semanal',
        dia_semana: '4',
        fecha_inicio: '2099-01-01',
        fecha_fin: '2099-01-22',
      }),
    )
    expect(resultado).toEqual({ ok: true, data: { id: SERIE, cantidad: 4 } })
    await correrAfter()
    expect(avisarSerieCocina).toHaveBeenCalledWith({
      actorId: DIRECTOR.id,
      serieId: SERIE,
      accion: 'creada',
      pedidos: ['2099-01-01', '2099-01-08', '2099-01-15', '2099-01-22'].map((fecha) => ({
        fecha,
        hora: null,
        tipo: 'otro',
        requiere_cocina: ['comida'],
        requiere_otro_texto: null,
      })),
    })
  })

  it('cancelar una serie avisa con las ocurrencias borradas', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2099-01-10T12:00:00-06:00'))
    const borradas = [
      { id: ID, fecha: '2099-01-15', hora: '10:00:00', tipo: 'san_rafael', requiere_cocina: ['comida'], requiere_otro_texto: null },
      { id: SERIE, fecha: '2099-01-22', hora: '10:00:00', tipo: 'san_rafael', requiere_cocina: ['comida'], requiere_otro_texto: null },
    ]
    const falso = usarCliente(clienteSupabaseFalso({ consultas: [{ data: borradas, error: null }] }))
    expect(await eliminarSerieDesdeHoy({ serie_id: SERIE })).toEqual({ ok: true, data: { cantidad: 2 } })
    expect(falso.operaciones[0].filtros).toEqual([
      ['serie_id', SERIE],
      ['fecha>=', '2099-01-10'],
    ])
    await correrAfter()
    expect(avisarSerieCocina).toHaveBeenCalledWith({
      actorId: DIRECTOR.id,
      serieId: SERIE,
      accion: 'cancelada',
      pedidos: borradas.map(({ fecha, hora, tipo, requiere_cocina, requiere_otro_texto }) => ({ fecha, hora, tipo, requiere_cocina, requiere_otro_texto })),
    })
  })
})
