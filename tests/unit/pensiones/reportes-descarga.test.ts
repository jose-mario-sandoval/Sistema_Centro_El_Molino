import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/pensiones/reportes/[id]/route'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { perfilDePrueba } from '@/tests/soporte/supabase-falso'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/servidor', () => ({ crearClienteServidor: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
const id = '3f1c2a9e-8b7d-4c6e-9a5b-1d2e3f4a5b6c'
let consultar: ReturnType<typeof vi.fn>
let descargar: ReturnType<typeof vi.fn>
function solicitar(documento = id) { return GET(new Request(`https://molino.test/api/pensiones/reportes/${documento}`), { params: Promise.resolve({ id: documento }) }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: perfilDePrueba(id, 'director') })
  consultar = vi.fn().mockResolvedValue({ data: { nombre: 'Finanzas año.pdf', ruta: `finanzas/${id}.pdf` }, error: null })
  vi.mocked(crearClienteServidor).mockResolvedValue({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: consultar }) }) }) } as never)
  descargar = vi.fn().mockResolvedValue({ data: new Blob(['%PDF-1.7\n%%EOF']), error: null })
  vi.mocked(crearClienteAdmin).mockReturnValue({ storage: { from: () => ({ download: descargar }) } } as never)
})

describe('descarga de reportes con sesión por solicitud', () => {
  it('exige Director o Administradora en cada GET y niega antes de usar la llave secreta', async () => {
    vi.mocked(perfilParaAccion).mockResolvedValue({ ok: false, error: 'No tenés permiso.' })
    expect((await solicitar()).status).toBe(403)
    expect((await solicitar()).status).toBe(403)
    expect(perfilParaAccion).toHaveBeenCalledTimes(2)
    expect(perfilParaAccion).toHaveBeenCalledWith('director', 'administradora')
    expect(crearClienteAdmin).not.toHaveBeenCalled()
    expect(consultar).not.toHaveBeenCalled()
  })

  it('entrega attachment privado sin caché y nunca revela la ruta de Storage', async () => {
    const respuesta = await solicitar()
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get('content-disposition')).toContain("filename*=UTF-8''Finanzas%20a%C3%B1o.pdf")
    expect(respuesta.headers.get('cache-control')).toContain('no-store')
    expect(respuesta.headers.get('content-type')).toBe('application/pdf')
    expect(respuesta.headers.get('x-content-type-options')).toBe('nosniff')
    expect(respuesta.headers.get('location')).toBeNull()
    expect(await respuesta.text()).toBe('%PDF-1.7\n%%EOF')
    expect(descargar).toHaveBeenCalledWith(`finanzas/${id}.pdf`)
  })

  it('un ID inventado o un documento retirado no obtiene acceso a Storage', async () => {
    expect((await solicitar('../finanzas/archivo.pdf')).status).toBe(404)
    consultar.mockResolvedValue({ data: null, error: null })
    expect((await solicitar()).status).toBe(404)
    expect(crearClienteAdmin).not.toHaveBeenCalled()
  })

  it('si Storage falla, no responde éxito ni genera enlaces alternativos', async () => {
    descargar.mockResolvedValue({ data: null, error: new Error('Sin red') })
    expect((await solicitar()).status).toBe(503)
  })
})
