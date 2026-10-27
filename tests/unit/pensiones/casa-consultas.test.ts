import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exigirRol } from '@/lib/auth/sesion'
import { obtenerHistorialDe, obtenerHistorialPropio, obtenerPensionesDe, obtenerPersonasPensionesCasa } from '@/lib/pensiones/consultas'
import { listarPerfiles } from '@/lib/perfiles/consultas'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { clienteSupabaseFalso, perfilDePrueba, type Respuesta } from '@/tests/soporte/supabase-falso'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/sesion', () => ({ exigirRol: vi.fn() }))
vi.mock('@/lib/perfiles/consultas', () => ({ listarPerfiles: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))

const DIRECTOR = '0b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'
const TITULAR = '1b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(exigirRol).mockResolvedValue(perfilDePrueba(DIRECTOR, 'director'))
})

/** Las páginas tienen respuesta propia para comprobar filtros en todo el historial. */
function clienteHistorial(respuestas: Respuesta[]) {
  const pendientes = [...respuestas]
  const consultas: { tabla: string; columnas?: string; filtros: [string, unknown][]; rango?: number[] }[] = []
  const cliente = { from(tabla: string) {
    const llamada: typeof consultas[number] = { tabla, filtros: [] }
    consultas.push(llamada)
    const consulta = {
      select(columnas: string) { llamada.columnas = columnas; return consulta },
      eq(columna: string, valor: unknown) { llamada.filtros.push([columna, valor]); return consulta },
      order() { return consulta },
      range(desde: number, hasta: number) { llamada.rango = [desde, hasta]; return consulta },
      maybeSingle() { return Promise.resolve(pendientes.shift()!) },
      then<T>(resolver: (r: Respuesta) => T) { return Promise.resolve(pendientes.shift()!).then(resolver) },
    }
    return consulta
  } }
  vi.mocked(crearClienteServidor).mockResolvedValue(cliente as never)
  return consultas
}

describe('consultas de Pensiones de la casa', () => {
  it.each([
    () => obtenerPersonasPensionesCasa(),
    () => obtenerPensionesDe(TITULAR, 2099),
    () => obtenerHistorialDe(TITULAR),
  ])('exige Director antes de consultar personas o pagos', async (consultar) => {
    vi.mocked(exigirRol).mockRejectedValue(new Error('Sin permiso'))
    await expect(consultar()).rejects.toThrow('Sin permiso')
    expect(exigirRol).toHaveBeenCalledWith('director')
    expect(listarPerfiles).not.toHaveBeenCalled()
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })

  it('lista residentes y otros directores activos por nombre, sin aplicar fuera_de_conteos', async () => {
    const residente = { ...perfilDePrueba(TITULAR, 'residente'), nombre: 'Residente visible', fuera_de_conteos: true }
    const otroDirector = { ...perfilDePrueba('otro-director', 'director'), nombre: 'Otro Director' }
    vi.mocked(listarPerfiles).mockResolvedValue([
      perfilDePrueba(DIRECTOR, 'director'), residente, otroDirector,
      { ...perfilDePrueba('inactivo', 'residente'), activo: false },
      perfilDePrueba('admin', 'administracion'), perfilDePrueba('administradora', 'administradora'),
    ])
    expect(await obtenerPersonasPensionesCasa()).toEqual([residente, otroDirector])
    expect(listarPerfiles).toHaveBeenCalledExactlyOnceWith({ soloActivos: true, roles: ['director', 'residente'] })
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })

  it.each([obtenerHistorialDe, (id: string) => obtenerPensionesDe(id, 2099)])('dirige la consulta propia a Marcar pensiones', async (consultar) => {
    await expect(consultar(DIRECTOR)).rejects.toThrow('propia pensión')
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })

  it.each([
    null,
    { id: TITULAR, activo: false, rol: 'residente' },
    { id: TITULAR, activo: false, rol: 'director' },
    { id: TITULAR, activo: true, rol: 'administracion' },
    { id: TITULAR, activo: true, rol: 'administradora' },
  ])('no consulta períodos ni historial de una cuenta inválida: %j', async (persona) => {
    const falso = clienteSupabaseFalso({ consultas: [{ data: persona, error: null }, { data: persona, error: null }] })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    await expect(obtenerPensionesDe(TITULAR, 2099)).rejects.toThrow('cuenta activa')
    await expect(obtenerHistorialDe(TITULAR)).rejects.toThrow('cuenta activa')
    expect(falso.rpcs).toEqual([])
    expect(falso.operaciones.every((o) => o.tabla === 'perfiles')).toBe(true)
  })

  it.each(['residente', 'director'])('consulta los períodos del titular %s y conserva cuota, saldo y exención devueltos por SQL', async (rol) => {
    const meses = [{ periodo: '2099-01-01', categoria: 'universitario', monto_centavos: 12345, pagado_centavos: 2345, registrado_en: null, exento: false }]
    const falso = clienteSupabaseFalso({
      consultas: [{ data: { id: TITULAR, activo: true, rol }, error: null }], rpc: [{ data: meses, error: null }],
    })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    expect(await obtenerPensionesDe(TITULAR, 2099)).toEqual(meses)
    expect(falso.operaciones[0].filtros).toEqual([['id', TITULAR]])
    expect(falso.rpcs).toEqual([{ nombre: 'pensiones_de', args: { p_usuario_id: TITULAR, p_anio: 2099 } }])
  })

  it('propaga los fallos de perfil y de períodos sin presentar datos vacíos', async () => {
    const error = { message: 'Sin conexión' }
    const falso = clienteSupabaseFalso({
      consultas: [{ data: null, error }, { data: { id: TITULAR, activo: true, rol: 'residente' }, error: null }],
      rpc: [{ data: null, error }],
    })
    vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
    await expect(obtenerPensionesDe(TITULAR, 2099)).rejects.toEqual(error)
    await expect(obtenerPensionesDe(TITULAR, 2099)).rejects.toEqual(error)
  })

  it.each(['propio', 'casa'])('filtra cada página del historial %s por su titular e incluye el autor del registro', async (vista) => {
    const titular = vista === 'propio' ? DIRECTOR : TITULAR
    const filas = Array.from({ length: 501 }, (_, i) => ({
      id: `abono-${i}`, usuario_id: titular, registrado_por: DIRECTOR, periodo: '2099-01-01',
      categoria: 'profesional', monto_centavos: 30000, abono_centavos: 1, registrado_en: '2099-01-02T12:00:00Z',
    }))
    const consultas = clienteHistorial([
      ...(vista === 'casa' ? [{ data: { id: TITULAR, activo: true, rol: 'residente' }, error: null }] : []),
      { data: filas.slice(0, 500), error: null }, { data: filas.slice(500), error: null },
    ])
    expect(await (vista === 'propio' ? obtenerHistorialPropio() : obtenerHistorialDe(TITULAR))).toEqual(filas)
    expect(exigirRol).toHaveBeenCalledWith(...(vista === 'propio' ? ['director', 'residente'] : ['director']))
    const paginas = consultas.filter((c) => c.tabla === 'pensiones_pagos')
    expect(paginas).toHaveLength(2)
    expect(paginas.map((p) => p.rango)).toEqual([[0, 499], [500, 999]])
    for (const pagina of paginas) {
      expect(pagina.filtros).toEqual([['usuario_id', titular]])
      expect(pagina.columnas).toContain('usuario_id, registrado_por')
    }
  })

  it('el historial propio de un Residente conserva el filtro de su sesión', async () => {
    vi.mocked(exigirRol).mockResolvedValue(perfilDePrueba(TITULAR, 'residente'))
    const consultas = clienteHistorial([{ data: [], error: null }])
    expect(await obtenerHistorialPropio()).toEqual([])
    expect(consultas[0].filtros).toEqual([['usuario_id', TITULAR]])
  })

  it('un fallo del historial no devuelve una lista parcial', async () => {
    const error = { message: 'Lectura fallida' }
    clienteHistorial([{ data: null, error }])
    await expect(obtenerHistorialPropio()).rejects.toEqual(error)
  })
})
