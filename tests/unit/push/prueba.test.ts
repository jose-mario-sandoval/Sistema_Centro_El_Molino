import { beforeEach, describe, expect, it, vi } from 'vitest'
import { enviarPrueba } from '@/lib/push/enviar'
import { mensajeDePrueba } from '@/lib/push/prueba'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { sendNotification } from 'web-push'

vi.mock('server-only', () => ({}))
vi.mock('web-push', () => ({ sendNotification: vi.fn(), setVapidDetails: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
vi.mock('@/lib/entorno', () => ({ variableEntorno: (nombre: string) => `valor-de-${nombre}` }))

describe('mensajeDePrueba', () => {
  const base = { dispositivos: 1, enviadas: 0, fallos: [] }

  it('envío aceptado: llegó, con la guía de qué revisar en el teléfono', () => {
    const m = mensajeDePrueba({ ...base, enviadas: 1 })
    expect(m.llego).toBe(true)
    expect(m.texto).toContain('aceptó el envío')
    expect(m.texto).toContain('No molestar')
  })

  it('403 de Apple: culpa a la firma del servidor y nombra el motivo', () => {
    const m = mensajeDePrueba({ ...base, fallos: [{ codigo: 403, motivo: 'BadJwtToken' }] })
    expect(m.llego).toBe(false)
    expect(m.texto).toContain('403: BadJwtToken')
    expect(m.texto).toContain('VAPID_SUBJECT')
  })

  it('401 se trata como una firma rechazada', () => {
    expect(mensajeDePrueba({ ...base, fallos: [{ codigo: 401, motivo: null }] }).texto).toContain('rechazó la firma')
  })

  it('404 y 410: el dispositivo ya no vale, hay que reactivar', () => {
    for (const codigo of [404, 410]) {
      expect(mensajeDePrueba({ ...base, fallos: [{ codigo, motivo: null }] }).texto).toContain('volvé a activarlas')
    }
  })

  it('sin respuesta del servicio, y otros códigos', () => {
    expect(mensajeDePrueba({ ...base, fallos: [{ codigo: null, motivo: null }] }).texto).toContain('no respondió')
    expect(mensajeDePrueba({ ...base, fallos: [{ codigo: 500, motivo: null }] }).texto).toContain('(500)')
  })

  it('sin llaves VAPID en el servidor, o sin dispositivo registrado', () => {
    expect(mensajeDePrueba({ ...base, sinConfiguracion: true }).texto).toContain('VAPID')
    expect(mensajeDePrueba({ dispositivos: 0, enviadas: 0, fallos: [] }).texto).toContain('no está registrado')
  })
})

type Fila = { id: string; endpoint: string; p256dh: string; auth: string }
const APPLE = 'https://web.push.apple.com/abc'

/** Cliente admin falso: `.eq()` se puede encadenar y la lectura se espera; el borrado registra los ids. */
function clienteFalso(filas: Fila[]) {
  const filtros: [string, string][] = []
  const borrados: string[][] = []
  const consulta = () => {
    let borrando = false
    const q: Record<string, unknown> = {
      select: () => q,
      delete: () => {
        borrando = true
        return q
      },
      eq: (columna: string, valor: string) => {
        filtros.push([columna, valor])
        return q
      },
      in: (_c: string, valores: string[]) => {
        if (borrando) borrados.push(valores)
        return Promise.resolve({ data: null, error: null })
      },
      then: (resolver: (v: unknown) => unknown) => resolver({ data: filas, error: null }),
    }
    return q
  }
  vi.mocked(crearClienteAdmin).mockReturnValue({ from: consulta } as never)
  return { filtros, borrados }
}

describe('enviarPrueba', () => {
  beforeEach(() => {
    vi.mocked(sendNotification).mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('manda a un dispositivo de la cuenta y cuenta lo enviado', async () => {
    const { filtros } = clienteFalso([{ id: 's1', endpoint: APPLE, p256dh: 'p', auth: 'a' }])
    vi.mocked(sendNotification).mockResolvedValue({ statusCode: 201, body: '', headers: {} })
    const r = await enviarPrueba('u1', APPLE)
    expect(r).toEqual({ dispositivos: 1, enviadas: 1, fallos: [] })
    expect(filtros).toEqual([['usuario_id', 'u1'], ['endpoint', APPLE]])
    const [, carga] = vi.mocked(sendNotification).mock.calls[0]
    expect(JSON.parse(String(carga))).toMatchObject({ titulo: 'Aviso de prueba', url: '/configuraciones' })
  })

  it('sin dispositivos no llama al servicio push', async () => {
    clienteFalso([])
    expect(await enviarPrueba('u1')).toEqual({ dispositivos: 0, enviadas: 0, fallos: [] })
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('registra el código y el motivo del rechazo de Apple', async () => {
    clienteFalso([{ id: 's1', endpoint: APPLE, p256dh: 'p', auth: 'a' }])
    vi.mocked(sendNotification).mockRejectedValue(
      Object.assign(new Error('rechazado'), { statusCode: 403, body: '{"reason":"BadJwtToken"}' }),
    )
    const r = await enviarPrueba('u1')
    expect(r.enviadas).toBe(0)
    expect(r.fallos).toEqual([{ codigo: 403, motivo: 'BadJwtToken' }])
  })

  it('un dispositivo caducado (410) se borra', async () => {
    const { borrados } = clienteFalso([{ id: 's1', endpoint: APPLE, p256dh: 'p', auth: 'a' }])
    vi.mocked(sendNotification).mockRejectedValue(Object.assign(new Error('gone'), { statusCode: 410 }))
    const r = await enviarPrueba('u1')
    expect(r.fallos).toEqual([{ codigo: 410, motivo: null }])
    expect(borrados).toEqual([['s1']])
  })

  it('un endpoint de un servicio desconocido nunca se llama', async () => {
    clienteFalso([{ id: 's1', endpoint: 'https://ejemplo.com/push', p256dh: 'p', auth: 'a' }])
    const r = await enviarPrueba('u1')
    expect(sendNotification).not.toHaveBeenCalled()
    expect(r.fallos).toHaveLength(1)
  })
})
