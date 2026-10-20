import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eliminarReportePension, subirReportePension } from '@/app/(app)/pensiones/acciones-reporte'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { perfilDePrueba } from '@/tests/soporte/supabase-falso'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))
vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
vi.mock('@/lib/pensiones/reportes-limpieza', () => ({ limpiarArchivosReportes: vi.fn() }))

const id = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'
let rpc: ReturnType<typeof vi.fn>
let upload: ReturnType<typeof vi.fn>
let consulta: { select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn> }

function formulario(contenido = '%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n') {
  const datos = new FormData()
  datos.set('categoria', 'finanzas')
  datos.set('archivo', new File([contenido], 'reporte.pdf', { type: 'application/pdf' }))
  return datos
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: perfilDePrueba(id, 'administradora') })
  rpc = vi.fn(async (nombre: string) => ({
    error: null, data: nombre === 'reservar_reporte_pension' ? [{ id, ruta: `finanzas/${id}.pdf` }] : id,
  }))
  consulta = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
  vi.mocked(crearClienteServidor).mockResolvedValue({ rpc, from: vi.fn(() => consulta) } as never)
  upload = vi.fn().mockResolvedValue({ data: {}, error: null })
  vi.mocked(crearClienteAdmin).mockReturnValue({ storage: { from: vi.fn(() => ({ upload })) } } as never)
})
afterEach(() => vi.restoreAllMocks())

describe('carga de reportes', () => {
  it('exige Administradora antes de leer archivos, reservar o crear un cliente privilegiado', async () => {
    const fallo = { ok: false as const, error: 'No tenés permiso.' }
    vi.mocked(perfilParaAccion).mockResolvedValue(fallo)
    expect(await subirReportePension(formulario())).toEqual(fallo)
    expect(perfilParaAccion).toHaveBeenCalledWith('administradora')
    expect(crearClienteAdmin).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechaza un PDF falso antes de persistir', async () => {
    expect((await subirReportePension(formulario('texto renombrado'))).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })

  it('reserva, sube sin sobrescribir y sólo entonces confirma retención y éxito', async () => {
    expect(await subirReportePension(formulario())).toEqual({ ok: true, data: { id } })
    expect(rpc.mock.calls.map(([nombre]) => nombre)).toEqual(['reservar_reporte_pension', 'finalizar_reporte_pension'])
    expect(rpc.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0])
    expect(upload.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[1])
    expect(upload).toHaveBeenCalledWith(`finanzas/${id}.pdf`, expect.any(Uint8Array), expect.objectContaining({ upsert: false }))
    expect(revalidatePath).toHaveBeenCalledWith('/pensiones/reporte')
  })

  it('una falla de carga nunca finaliza ni retira documentos anteriores', async () => {
    upload.mockResolvedValue({ error: new Error('Storage no disponible') })
    expect((await subirReportePension(formulario())).ok).toBe(false)
    expect(rpc.mock.calls.map(([nombre]) => nombre)).toEqual(['reservar_reporte_pension', 'abandonar_reporte_pension'])
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('si se perdió la respuesta de una carga confirmada, verifica y devuelve éxito sin borrar', async () => {
    rpc.mockImplementation(async (nombre: string) => nombre === 'reservar_reporte_pension'
      ? { data: [{ id, ruta: `finanzas/${id}.pdf` }], error: null }
      : { data: null, error: new Error('Respuesta perdida') })
    consulta.maybeSingle.mockResolvedValue({ data: { id }, error: null })
    expect(await subirReportePension(formulario())).toEqual({ ok: true, data: { id } })
    expect(rpc.mock.calls.map(([nombre]) => nombre)).not.toContain('abandonar_reporte_pension')
  })

  it('si falla la finalización conserva la reserva/cola para reintentar la limpieza', async () => {
    rpc.mockImplementation(async (nombre: string) => nombre === 'reservar_reporte_pension'
      ? { data: [{ id, ruta: `finanzas/${id}.pdf` }], error: null }
      : { data: null, error: new Error('Base no disponible') })
    expect((await subirReportePension(formulario())).ok).toBe(false)
    expect(rpc).toHaveBeenCalledWith('abandonar_reporte_pension', { p_id: id })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('eliminación de reportes', () => {
  it('exige Administradora antes de tocar la base', async () => {
    const fallo = { ok: false as const, error: 'No tenés permiso.' }
    vi.mocked(perfilParaAccion).mockResolvedValue(fallo)
    expect(await eliminarReportePension({ id })).toEqual(fallo)
    expect(perfilParaAccion).toHaveBeenCalledWith('administradora')
    expect(rpc).not.toHaveBeenCalled()
  })

  it('rechaza un identificador inválido sin llamar a la base', async () => {
    expect((await eliminarReportePension({ id: 'no-es-un-uuid' })).ok).toBe(false)
    expect((await eliminarReportePension(null)).ok).toBe(false)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('borra la ficha por la función de la base y programa la limpieza del archivo', async () => {
    expect(await eliminarReportePension({ id })).toEqual({ ok: true, data: null })
    expect(rpc).toHaveBeenCalledWith('eliminar_reporte_pension', { p_id: id })
    expect(revalidatePath).toHaveBeenCalledWith('/pensiones/reporte')
    expect(after).toHaveBeenCalledTimes(1)
  })

  it('si la base falla, informa sin revalidar ni programar limpieza', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Base no disponible') })
    expect((await eliminarReportePension({ id })).ok).toBe(false)
    expect(revalidatePath).not.toHaveBeenCalled()
    expect(after).not.toHaveBeenCalled()
  })
})
