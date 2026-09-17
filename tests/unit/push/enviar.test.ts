import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { enviarAUsuarios } from '@/lib/push/enviar'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { sendNotification } from 'web-push'

// El envío se prueba sin red ni base: web-push, el cliente admin y las variables se reemplazan.
vi.mock('server-only', () => ({}))
vi.mock('web-push', () => ({ sendNotification: vi.fn(), setVapidDetails: vi.fn() }))
vi.mock('@/lib/supabase/admin', () => ({ crearClienteAdmin: vi.fn() }))
vi.mock('@/lib/entorno', () => ({ variableEntorno: (nombre: string) => `valor-de-${nombre}` }))

const CARGA = { titulo: 'Título', cuerpo: 'Cuerpo', url: '/mensajes', etiqueta: 'mensaje-1' }

type Fila = { id: string; endpoint: string; p256dh: string; auth: string }

function fila(id: string, endpoint = `https://fcm.googleapis.com/fcm/send/${id}`): Fila {
  return { id, endpoint, p256dh: `p256dh-${id}`, auth: `auth-${id}` }
}

/** Error del servicio push tal como lo lanza web-push (WebPushError). */
function errorPush(statusCode: number) {
  return Object.assign(new Error(`Received unexpected response code ${statusCode}`), { statusCode })
}

/**
 * Cliente admin falso: la lectura devuelve `filas` y registra los filtros; el borrado registra los ids.
 * `.in()` es la última llamada de las dos consultas, así que devuelve directamente la respuesta.
 */
function clienteFalso(filas: Fila[], errorLectura: unknown = null) {
  const leidos: string[][] = []
  const borrados: string[][] = []

  function consulta() {
    let borrando = false
    const q = {
      select: () => q,
      delete: () => {
        borrando = true
        return q
      },
      in: (_columna: string, valores: string[]) => {
        if (borrando) {
          borrados.push(valores)
          return Promise.resolve({ data: null, error: null })
        }
        leidos.push(valores)
        return Promise.resolve({ data: errorLectura ? null : filas, error: errorLectura })
      },
    }
    return q
  }

  return { cliente: { from: vi.fn(consulta) }, leidos, borrados }
}

function usarCliente(filas: Fila[], errorLectura: unknown = null) {
  const falso = clienteFalso(filas, errorLectura)
  vi.mocked(crearClienteAdmin).mockReturnValue(falso.cliente as never)
  return falso
}

let errorConsola: MockInstance<typeof console.error>

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(sendNotification).mockResolvedValue({ statusCode: 201, body: '', headers: {} })
  errorConsola = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('enviarAUsuarios', () => {
  it('sin destinatarios no lee la base ni envía nada', async () => {
    const falso = usarCliente([])
    expect(await enviarAUsuarios([], CARGA)).toEqual({ enviadas: 0, caducadas: 0, fallidas: 0, descartadas: 0 })
    expect(falso.cliente.from).not.toHaveBeenCalled()
    expect(sendNotification).not.toHaveBeenCalled()
  })

  it('consulta cada usuario una sola vez aunque el id venga repetido', async () => {
    const falso = usarCliente([fila('s1')])
    await enviarAUsuarios(['u1', 'u2', 'u1'], CARGA)
    expect(falso.leidos).toEqual([['u1', 'u2']])
    expect(sendNotification).toHaveBeenCalledTimes(1)
  })

  it('envía a cada dispositivo con TTL, urgencia y tiempo límite', async () => {
    usarCliente([fila('s1'), fila('s2')])
    const resumen = await enviarAUsuarios(['u1'], CARGA, { ttlSegundos: 3600 })

    expect(resumen).toEqual({ enviadas: 2, caducadas: 0, fallidas: 0, descartadas: 0 })
    expect(sendNotification).toHaveBeenCalledWith(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/s1', keys: { p256dh: 'p256dh-s1', auth: 'auth-s1' } },
      JSON.stringify(CARGA),
      { TTL: 3600, urgency: 'high', timeout: 10_000 },
    )
  })

  it('borra las suscripciones que el servicio push da por caducadas (404 y 410)', async () => {
    const falso = usarCliente([fila('s1'), fila('s2'), fila('s3')])
    vi.mocked(sendNotification)
      .mockRejectedValueOnce(errorPush(410))
      .mockRejectedValueOnce(errorPush(404))
      .mockResolvedValueOnce({ statusCode: 201, body: '', headers: {} })

    const resumen = await enviarAUsuarios(['u1'], CARGA)

    expect(resumen).toEqual({ enviadas: 1, caducadas: 2, fallidas: 0, descartadas: 0 })
    expect(falso.borrados).toEqual([['s1', 's2']])
  })

  it('cuenta como fallidos los demás errores y conserva la suscripción', async () => {
    const falso = usarCliente([fila('s1'), fila('s2')])
    vi.mocked(sendNotification)
      .mockRejectedValueOnce(errorPush(500))
      .mockRejectedValueOnce(new Error('se cayó la red'))

    const resumen = await enviarAUsuarios(['u1'], CARGA)

    expect(resumen).toEqual({ enviadas: 0, caducadas: 0, fallidas: 2, descartadas: 0 })
    expect(falso.borrados).toEqual([])
    expect(errorConsola).toHaveBeenCalledTimes(2)
  })

  it('no llama a hosts desconocidos: los descarta, los borra y registra el host', async () => {
    const falso = usarCliente([fila('s1'), fila('s2', 'https://atacante.example/push')])

    const resumen = await enviarAUsuarios(['u1'], CARGA)

    expect(resumen).toEqual({ enviadas: 1, caducadas: 0, fallidas: 0, descartadas: 1 })
    expect(falso.borrados).toEqual([['s2']])
    expect(sendNotification).toHaveBeenCalledTimes(1)
    expect(errorConsola).toHaveBeenCalledWith(expect.stringContaining('servicio desconocido'), {
      suscripcion: 's2',
      host: 'atacante.example',
    })
  })

  it('si la lectura falla, no envía nada y lo registra', async () => {
    usarCliente([], { message: 'sin conexión con la base' })
    expect(await enviarAUsuarios(['u1'], CARGA)).toEqual({
      enviadas: 0,
      caducadas: 0,
      fallidas: 0,
      descartadas: 0,
    })
    expect(sendNotification).not.toHaveBeenCalled()
    expect(errorConsola).toHaveBeenCalledOnce()
  })
})
