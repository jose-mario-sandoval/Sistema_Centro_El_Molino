import { beforeEach, describe, expect, it, vi } from 'vitest'
import { limpiarArchivosReportes } from '@/lib/pensiones/reportes-limpieza'
import { crearClienteAdmin } from '@/lib/supabase/admin'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
let remove: ReturnType<typeof vi.fn>
let confirmar: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.clearAllMocks()
  remove = vi.fn().mockResolvedValue({ error: null })
  confirmar = vi.fn().mockResolvedValue({ error: null })
  vi.mocked(crearClienteAdmin).mockReturnValue({
    rpc: vi.fn().mockResolvedValue({ data: [{ ruta: 'finanzas/antiguo.pdf' }, { ruta: 'otras_utilidades/antiguo.pdf' }], error: null }),
    storage: { from: vi.fn(() => ({ remove })) },
    from: vi.fn(() => ({ delete: () => ({ eq: confirmar }) })),
  } as never)
})

describe('cola durable de limpieza', () => {
  it('borra primero Storage y después la cola de cada categoría', async () => {
    expect(await limpiarArchivosReportes()).toEqual({ eliminados: 2, pendientes: 0 })
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(confirmar.mock.invocationCallOrder[0])
    expect(remove).toHaveBeenCalledWith(['finanzas/antiguo.pdf'])
    expect(remove).toHaveBeenCalledWith(['otras_utilidades/antiguo.pdf'])
  })

  it('si Storage falla, retiene la tarea y sigue con la otra categoría', async () => {
    remove.mockResolvedValueOnce({ error: new Error('Reintentar') })
    expect(await limpiarArchivosReportes()).toEqual({ eliminados: 1, pendientes: 1 })
    expect(confirmar).toHaveBeenCalledTimes(1)
    expect(confirmar).toHaveBeenCalledWith('ruta', 'otras_utilidades/antiguo.pdf')
  })

  it('si se pierde la confirmación después de borrar el objeto, la tarea permanece reintentable', async () => {
    confirmar.mockResolvedValueOnce({ error: new Error('Respuesta perdida') })
    expect(await limpiarArchivosReportes()).toEqual({ eliminados: 1, pendientes: 1 })
  })
})
