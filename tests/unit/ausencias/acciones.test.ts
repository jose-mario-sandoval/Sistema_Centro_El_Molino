import { beforeEach, describe, expect, it, vi } from 'vitest'
import { marcarAusencia, quitarAusencia } from '@/app/(app)/calendario/acciones-ausencias'
import { fallo } from '@/lib/acciones/resultado'
import { perfilParaAccion, type Perfil } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { clienteSupabaseFalso, perfilDePrueba } from '@/tests/soporte/supabase-falso'

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))

const DIRECTOR = perfilDePrueba('0b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f', 'director')
const RESIDENTE = perfilDePrueba('6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', 'residente')
const OTRA = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f'
const ID_AUSENCIA = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'
const SIN_PERMISO = { ok: false, error: 'No tenés permiso para hacer esto.' }

function sesionDe(perfil: Perfil) {
  vi.mocked(perfilParaAccion).mockImplementation(async (...roles) =>
    roles.length > 0 && !roles.includes(perfil.rol) ? fallo('No tenés permiso para hacer esto.') : { ok: true, perfil },
  )
}

function usarCliente(falso: ReturnType<typeof clienteSupabaseFalso>) {
  vi.mocked(crearClienteServidor).mockResolvedValue(falso.cliente as never)
  return falso
}

function formulario(campos: Record<string, string>) {
  const datos = new FormData()
  for (const [clave, valor] of Object.entries(campos)) datos.set(clave, valor)
  return datos
}

const RANGO = { desde: '2099-01-10', hasta: '2099-01-12' }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('marcarAusencia', () => {
  it('sin usuarioId, la propia (y usuarioId no viaja a la base)', async () => {
    sesionDe(RESIDENTE)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await marcarAusencia(null, formulario(RANGO))).toEqual({ ok: true, data: null })
    expect(falso.operaciones).toEqual([
      { tabla: 'ausencias', operacion: 'insert', valores: { usuario_id: RESIDENTE.id, ...RANGO }, filtros: [] },
    ])
  })

  it('un usuarioId vacío (campo oculto sin valor) también es la propia', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso())
    await marcarAusencia(null, formulario({ ...RANGO, usuarioId: '' }))
    expect(falso.operaciones[0].valores).toMatchObject({ usuario_id: DIRECTOR.id })
  })

  it('el Director marca la de otra persona', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await marcarAusencia(null, formulario({ ...RANGO, usuarioId: OTRA }))).toEqual({ ok: true, data: null })
    expect(falso.operaciones[0].valores).toEqual({ usuario_id: OTRA, ...RANGO })
  })

  it('un Residente no marca la de otra persona', async () => {
    sesionDe(RESIDENTE)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await marcarAusencia(null, formulario({ ...RANGO, usuarioId: OTRA }))).toMatchObject(SIN_PERMISO)
    expect(falso.operaciones).toEqual([])
  })
})

describe('quitarAusencia: filtra por persona además de por id', () => {
  it('sin usuarioId, solo una propia (el Director puede ver las de todos)', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso({ consultas: [{ data: [{ id: ID_AUSENCIA }], error: null }] }))
    expect(await quitarAusencia({ id: ID_AUSENCIA })).toEqual({ ok: true, data: null })
    expect(falso.operaciones[0]).toMatchObject({
      tabla: 'ausencias',
      operacion: 'delete',
      filtros: [
        ['id', ID_AUSENCIA],
        ['usuario_id', DIRECTOR.id],
      ],
    })
  })

  it('el Director quita la de otra persona', async () => {
    sesionDe(DIRECTOR)
    const falso = usarCliente(clienteSupabaseFalso({ consultas: [{ data: [{ id: ID_AUSENCIA }], error: null }] }))
    await quitarAusencia({ id: ID_AUSENCIA, usuarioId: OTRA })
    expect(falso.operaciones[0].filtros).toContainEqual(['usuario_id', OTRA])
  })

  it('un Residente no quita la de otra persona', async () => {
    sesionDe(RESIDENTE)
    const falso = usarCliente(clienteSupabaseFalso())
    expect(await quitarAusencia({ id: ID_AUSENCIA, usuarioId: OTRA })).toMatchObject(SIN_PERMISO)
    expect(falso.operaciones).toEqual([])
  })

  it('0 filas: ya no existe', async () => {
    sesionDe(RESIDENTE)
    usarCliente(clienteSupabaseFalso({ consultas: [{ data: [], error: null }] }))
    expect(await quitarAusencia({ id: ID_AUSENCIA })).toMatchObject({ ok: false, error: 'Esa ausencia ya no existe.' })
  })
})
