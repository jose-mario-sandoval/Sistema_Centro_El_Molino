import { beforeEach, describe, expect, it, vi } from 'vitest'
import { alternarReaccion } from '@/app/(app)/mensajes/acciones'
import { perfilParaAccion, type Perfil } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/servidor'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))
vi.mock('@/lib/push/avisos', () => ({}))

const MENSAJE = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'
const USUARIO = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

function cliente(error: { code: string } | null = null) {
  const insertar = vi.fn().mockResolvedValue({ error })
  const filtros: [string, string][] = []
  const consulta = {
    eq: (columna: string, valor: string) => {
      filtros.push([columna, valor])
      return { eq: (otraColumna: string, otroValor: string) => {
        filtros.push([otraColumna, otroValor])
        return Promise.resolve({ error })
      } }
    },
  }
  vi.mocked(crearClienteServidor).mockResolvedValue({
    from: () => ({ insert: insertar, delete: () => consulta }),
  } as unknown as Awaited<ReturnType<typeof crearClienteServidor>>)
  return { insertar, filtros }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: { id: USUARIO, rol: 'residente' } as Perfil })
})

describe('alternarReaccion: publicaciones y respuestas usan el mismo permiso en la base', () => {
  it('guarda el estado final como el usuario de la sesión, sin aceptar una identidad del cliente', async () => {
    const { insertar } = cliente()
    expect(await alternarReaccion({ mensajeId: MENSAJE, presente: true, usuarioId: 'otro' })).toEqual({ ok: true, data: { presente: true } })
    expect(insertar).toHaveBeenCalledExactlyOnceWith({ mensaje_id: MENSAJE, usuario_id: USUARIO })
  })

  it('trata el duplicado de la clave compuesta como éxito idempotente', async () => {
    cliente({ code: '23505' })
    expect(await alternarReaccion({ mensajeId: MENSAJE, presente: true })).toEqual({ ok: true, data: { presente: true } })
  })

  it('explica el rechazo RLS a un mensaje o hilo que no se puede leer', async () => {
    cliente({ code: '42501' })
    const resultado = await alternarReaccion({ mensajeId: MENSAJE, presente: true })
    expect(resultado).toEqual({ ok: false, error: 'No podés reaccionar a un mensaje que no tenés permiso de leer.' })
  })

  it('al quitar filtra por mensaje y por el usuario de la sesión', async () => {
    const { filtros } = cliente()
    expect(await alternarReaccion({ mensajeId: MENSAJE, presente: false })).toEqual({ ok: true, data: { presente: false } })
    expect(filtros).toEqual([['mensaje_id', MENSAJE], ['usuario_id', USUARIO]])
  })

  it('valida el destino antes de crear el cliente', async () => {
    expect(await alternarReaccion({ mensajeId: 'invalido', presente: true })).toEqual({ ok: false, error: 'Reacción inválida.' })
    expect(crearClienteServidor).not.toHaveBeenCalled()
  })
})
