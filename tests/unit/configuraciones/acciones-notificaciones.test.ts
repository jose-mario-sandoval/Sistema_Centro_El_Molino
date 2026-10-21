import { beforeEach, describe, expect, it, vi } from 'vitest'
import { actualizarPreferenciasAvisos, enviarAvisoDePrueba } from '@/app/(app)/configuraciones/acciones-notificaciones'
import { fallo } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { enviarPrueba } from '@/lib/push/enviar'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { clienteSupabaseFalso, perfilDePrueba } from '@/tests/soporte/supabase-falso'

// Sin base: la sesión y el cliente admin se reemplazan; se mira qué fila y qué columnas se escriben.
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/sesion', () => ({ perfilParaAccion: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
// El aviso de prueba usa el envío push (web-push y 'server-only'): no se ejerce acá.
vi.mock('@/lib/push/enviar', () => ({ enviarPrueba: vi.fn() }))

const RESIDENTE = perfilDePrueba('6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', 'residente')
const OTRA = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f'

function usarAdmin(falso: ReturnType<typeof clienteSupabaseFalso>) {
  vi.mocked(crearClienteAdmin).mockReturnValue(falso.cliente as never)
  return falso
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: RESIDENTE })
})

describe('actualizarPreferenciasAvisos', () => {
  it('guarda las cuatro preferencias en la fila de la sesión', async () => {
    const falso = usarAdmin(clienteSupabaseFalso())
    const resultado = await actualizarPreferenciasAvisos({
      avisarHoraLimite: true,
      avisarMensajes: false,
      avisarCambios: false,
      avisarCocina: true,
    })
    expect(resultado).toEqual({ ok: true, data: null })
    expect(falso.operaciones).toEqual([
      {
        tabla: 'perfiles',
        operacion: 'update',
        valores: { avisar_hora_limite: true, avisar_mensajes: false, avisar_cambios: false, avisar_cocina: true },
        filtros: [['id', RESIDENTE.id]],
      },
    ])
  })

  it('solo escribe lo que llega: una pestaña con la versión anterior no borra las nuevas', async () => {
    const falso = usarAdmin(clienteSupabaseFalso())
    await actualizarPreferenciasAvisos({ avisarHoraLimite: false, avisarMensajes: true })
    expect(falso.operaciones[0].valores).toEqual({ avisar_hora_limite: false, avisar_mensajes: true })
  })
  it('Administradora guarda la preferencia independiente de pagos de pensiones', async () => {
    vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: perfilDePrueba(RESIDENTE.id, 'administradora') })
    const falso = usarAdmin(clienteSupabaseFalso())
    await actualizarPreferenciasAvisos({ avisarHoraLimite: false, avisarMensajes: false, avisarCocina: false, avisarPensiones: true })
    expect(falso.operaciones[0].valores).toEqual({ avisar_hora_limite: false, avisar_mensajes: false, avisar_cocina: false, avisar_pensiones: true })
  })
  it('otros roles no alteran la preferencia de pensiones aunque la envíen manualmente', async () => {
    for (const rol of ['director', 'residente', 'administracion'] as const) {
      vi.mocked(perfilParaAccion).mockResolvedValue({ ok: true, perfil: perfilDePrueba(RESIDENTE.id, rol) })
      const falso = usarAdmin(clienteSupabaseFalso())
      await actualizarPreferenciasAvisos({ avisarHoraLimite: true, avisarMensajes: true, avisarPensiones: false })
      expect(falso.operaciones[0].valores).not.toHaveProperty('avisar_pensiones')
    }
  })

  it('nunca toca otra cuenta aunque el pedido traiga otro id', async () => {
    const falso = usarAdmin(clienteSupabaseFalso())
    await actualizarPreferenciasAvisos({ avisarHoraLimite: true, avisarMensajes: true, avisarCocina: false, id: OTRA, usuarioId: OTRA })
    expect(falso.operaciones[0].filtros).toEqual([['id', RESIDENTE.id]])
    expect(falso.operaciones[0].valores).not.toHaveProperty('id')
  })

  it('sin sesión no llega a la base', async () => {
    vi.mocked(perfilParaAccion).mockResolvedValue(fallo('Tu sesión expiró. Volvé a iniciar sesión.'))
    const falso = usarAdmin(clienteSupabaseFalso())
    expect(await actualizarPreferenciasAvisos({ avisarHoraLimite: true, avisarMensajes: true })).toMatchObject({ ok: false })
    expect(falso.operaciones).toEqual([])
  })

  it('valores inválidos: fallo sin escribir', async () => {
    const falso = usarAdmin(clienteSupabaseFalso())
    expect(await actualizarPreferenciasAvisos({ avisarHoraLimite: true, avisarMensajes: true, avisarCocina: 'no' })).toMatchObject({
      ok: false,
      error: 'Las preferencias no son válidas.',
    })
    expect(falso.operaciones).toEqual([])
  })
})

describe('enviarAvisoDePrueba', () => {
  it('prueba con la cuenta de la sesión y devuelve el mensaje', async () => {
    vi.mocked(enviarPrueba).mockResolvedValue({ dispositivos: 1, enviadas: 1, fallos: [] })
    const r = await enviarAvisoDePrueba({ endpoint: 'https://web.push.apple.com/abc' })
    expect(r).toMatchObject({ ok: true, data: { llego: true } })
    expect(enviarPrueba).toHaveBeenCalledWith(RESIDENTE.id, 'https://web.push.apple.com/abc')
  })

  it('un endpoint de un servicio desconocido se rechaza sin enviar nada', async () => {
    const r = await enviarAvisoDePrueba({ endpoint: 'https://ejemplo.com/push' })
    expect(r.ok).toBe(false)
    expect(enviarPrueba).not.toHaveBeenCalled()
  })

  it('sin sesión no envía', async () => {
    vi.mocked(perfilParaAccion).mockResolvedValue(fallo('No tenés permiso para hacer esto.'))
    expect((await enviarAvisoDePrueba({})).ok).toBe(false)
    expect(enviarPrueba).not.toHaveBeenCalled()
  })

  it('si el envío falla por dentro, avisa sin romper', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(enviarPrueba).mockRejectedValue(new Error('base caída'))
    expect(await enviarAvisoDePrueba({})).toMatchObject({ ok: false, error: expect.stringContaining('aviso de prueba') })
  })
})
