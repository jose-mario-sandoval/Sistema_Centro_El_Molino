import { beforeEach, describe, expect, it, vi } from 'vitest'
import { obtenerNotaDietaDe, obtenerResumenPlanSemanal, obtenerSemanaParaAdministracion } from '@/lib/comidas/consultas'
import { listarPerfiles } from '@/lib/perfiles/consultas'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { clienteSupabaseFalso } from '@/tests/soporte/supabase-falso'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/sesion', () => ({ obtenerPerfilActual: vi.fn() }))
vi.mock('@/lib/perfiles/consultas', () => ({ listarPerfiles: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))
beforeEach(() => { vi.clearAllMocks() })

describe('consultas de notas y asistentes', () => {
  it('filtra siempre la nota por persona, también cuando quien consulta lee las de toda la casa', async () => {
    const falso = clienteSupabaseFalso({ consultas: [{ data: { nota: 'Indicación general' }, error: null }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect(await obtenerNotaDietaDe('persona')).toBe('Indicación general')
    expect(falso.operaciones).toEqual([{
      tabla: 'notas_dieta', operacion: 'select', columnas: 'nota', filtros: [['usuario_id', 'persona']],
    }])
  })

  it('sin nota devuelve null y un fallo de lectura no se transforma en un campo vacío', async () => {
    const fallo = { message: 'Sin conexión' }
    const falso = clienteSupabaseFalso({ consultas: [{ data: null, error: null }, { data: null, error: fallo }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect(await obtenerNotaDietaDe('persona')).toBeNull()
    await expect(obtenerNotaDietaDe('persona')).rejects.toEqual(fallo)
  })

  function clienteParaCasa(cortadas = false) {
    const perfiles = [
      { id: 'a', siglas: 'AA', nombre: 'Nombre privado A', activo: true, rol: 'residente' as const },
      { id: 'b', siglas: 'BB', nombre: 'Nombre privado B', activo: true, rol: 'director' as const },
    ]
    vi.mocked(listarPerfiles).mockResolvedValue(perfiles)
    const consultas: { tabla: string; filtros: [string, unknown][] }[] = []
    const from = (tabla: string) => {
      const llamada = { tabla, filtros: [] as [string, unknown][] }
      consultas.push(llamada)
      const data = tabla === 'notas_dieta'
        ? [{ usuario_id: 'a', nota: 'Indicación general' }]
        : tabla === 'plan_semanal'
          ? perfiles.map(({ id }) => ({ usuario_id: id, dia_semana: 3, comida: 'almuerzo', estado: 'si', nota: null }))
          : []
      const consulta = {
        select: () => consulta,
        in: (columna: string, valores: unknown) => { llamada.filtros.push([columna, valores]); return consulta },
        gte: () => consulta,
        lte: () => consulta,
        then: (resolve: (valor: unknown) => unknown) => Promise.resolve({ data, error: null, count: cortadas ? data.length + 1 : data.length }).then(resolve),
      }
      return consulta
    }
    const cliente = { from, rpc: vi.fn(async () => ({ data: ['b'], error: null })) }
    vi.mocked(crearClienteServidor).mockResolvedValue(cliente as never)
    return { consultas, cliente }
  }

  it('plan habitual envía siglas y notas de los comensales activos sin nombres ni IDs', async () => {
    const { consultas } = clienteParaCasa()
    const plan = await obtenerResumenPlanSemanal()
    expect(listarPerfiles).toHaveBeenCalledWith({ conComidas: true })
    expect(consultas.find(({ tabla }) => tabla === 'notas_dieta')?.filtros).toContainEqual(['usuario_id', ['a', 'b']])
    expect(plan[3].almuerzo.asistentes).toEqual([
      { siglas: 'AA', estado: 'si', nota: null, notaDieta: 'Indicación general' },
      { siglas: 'BB', estado: 'si', nota: null, notaDieta: null },
    ])
    expect(JSON.stringify(plan)).not.toMatch(/Nombre privado|"id"|"nombre"|"usuario_id"/)
  })

  it('semana concreta aplica ausencias y conserva la nota de quien sí participa', async () => {
    const { cliente } = clienteParaCasa()
    const dias = await obtenerSemanaParaAdministracion('2026-10-12')
    expect(cliente.rpc).toHaveBeenCalledTimes(7)
    expect(dias[2].resumen.almuerzo.asistentes).toEqual([
      { siglas: 'AA', estado: 'si', nota: null, notaDieta: 'Indicación general' },
    ])
    expect(JSON.stringify(dias)).not.toMatch(/Nombre privado|"id"|"nombre"|"usuario_id"/)
  })

  it('rechaza notas truncadas por PostgREST en vez de mostrar información incompleta', async () => {
    clienteParaCasa(true)
    await expect(obtenerResumenPlanSemanal()).rejects.toThrow('Notas de dieta: llegaron 1 de 2 filas')
  })
})
