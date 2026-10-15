import 'server-only'
import { sendNotification, setVapidDetails } from 'web-push'
import { variableEntorno } from '@/lib/entorno'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { esEndpointPushPermitido } from '@/lib/validacion/push'
import type { CargaPush } from './mensajes-push'
import type { FalloEnvio, ResultadoPrueba } from './prueba'

export type ResumenEnvio = { enviadas: number; caducadas: number; fallidas: number; descartadas: number }

/** Identidad persistente del evento, distinta de la etiqueta visual que reemplaza avisos en el teléfono. */
export type AvisoMensaje = {
  mensajeId: string
  revision: number
  tipo: 'publicacion' | 'respuesta' | 'pendiente' | 'moderacion'
}

const DOCE_HORAS = 12 * 60 * 60

/** Tiempo máximo de cada petición al servicio push: sin esto, after() puede quedarse colgado. */
const ESPERA_ENVIO_MS = 10_000

let vapidConfigurado = false

/** VAPID se configura solo cuando hay algo que enviar: el build y las rutas funcionan aunque falten las variables. */
function configurarVapid() {
  if (vapidConfigurado) return
  setVapidDetails(
    variableEntorno('VAPID_SUBJECT'),
    variableEntorno('NEXT_PUBLIC_VAPID_PUBLIC_KEY'),
    variableEntorno('VAPID_PRIVATE_KEY'),
  )
  vapidConfigurado = true
}

/** Código HTTP del servicio push (WebPushError.statusCode), si lo hay. */
function codigoHttp(error: unknown): number | null {
  if (typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode
  }
  return null
}

/** Host del endpoint, para los logs. Nunca se registran las llaves de la suscripción. */
function hostDe(endpoint: string): string {
  try {
    return new URL(endpoint).host
  } catch {
    return '(endpoint inválido)'
  }
}

/** Envía `carga` a todos los dispositivos de `usuarioIds`. Borra las suscripciones caducadas (404/410, spec §8.2). */
export async function enviarAUsuarios(
  usuarioIds: string[],
  carga: CargaPush,
  opciones: { ttlSegundos?: number; avisoMensaje?: AvisoMensaje } = {},
): Promise<ResumenEnvio> {
  const resumen: ResumenEnvio = { enviadas: 0, caducadas: 0, fallidas: 0, descartadas: 0 }
  const ids = [...new Set(usuarioIds)]
  if (ids.length === 0) return resumen

  const admin = crearClienteAdmin()
  const { data: suscripciones, error } = await admin
    .from('suscripciones_push')
    .select('id, endpoint, p256dh, auth')
    .in('usuario_id', ids)
  if (error) {
    console.error('[push] no se pudieron leer las suscripciones', error)
    return resumen
  }
  if (suscripciones.length === 0) return resumen

  configurarVapid()
  // Reservar antes del envío es deliberado: si el proveedor aceptó el push pero se perdió su respuesta,
  // volver a intentarlo produciría dos avisos. La clave única en PostgreSQL cubre también dos procesos.
  // Un fallo de configuración o de lectura ocurre antes de reservar, y se puede reintentar sin pérdida.
  let habilitadas: Set<string> | null = null
  if (opciones.avisoMensaje) {
    const { mensajeId, revision, tipo } = opciones.avisoMensaje
    const { data, error: errorReserva } = await admin.rpc('reservar_avisos_mensaje', {
      p_mensaje_id: mensajeId,
      p_revision: revision,
      p_tipo: tipo,
      p_suscripciones: suscripciones.map((s) => s.id),
    })
    if (errorReserva) throw errorReserva
    habilitadas = new Set(data)
  }
  const cuerpo = JSON.stringify(carga)
  const caducadas: string[] = []
  const descartadas: string[] = []

  await Promise.all(
    suscripciones.map(async (s) => {
      if (habilitadas && !habilitadas.has(s.id)) return
      // Segunda barrera después de la validación de /api/push: nunca se llama a un host desconocido.
      if (!esEndpointPushPermitido(s.endpoint)) {
        descartadas.push(s.id)
        console.error('[push] endpoint de un servicio desconocido: se borra la suscripción', {
          suscripcion: s.id,
          host: hostDe(s.endpoint),
        })
        return
      }
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, {
          TTL: opciones.ttlSegundos ?? DOCE_HORAS,
          urgency: 'high',
          timeout: ESPERA_ENVIO_MS,
        })
        resumen.enviadas++
      } catch (errorEnvio) {
        const codigo = codigoHttp(errorEnvio)
        if (codigo === 404 || codigo === 410) {
          caducadas.push(s.id)
        } else {
          resumen.fallidas++
          console.error('[push] error al enviar', { suscripcion: s.id, codigo, error: errorEnvio })
        }
      }
    }),
  )

  const porBorrar = [...caducadas, ...descartadas]
  if (porBorrar.length > 0) {
    const { error: errorBorrado } = await admin.from('suscripciones_push').delete().in('id', porBorrar)
    if (errorBorrado) console.error('[push] no se pudieron borrar suscripciones', errorBorrado)
    else {
      resumen.caducadas = caducadas.length
      resumen.descartadas = descartadas.length
    }
  }

  return resumen
}

/** Texto del servicio push (WebPushError.body, p. ej. {"reason":"BadJwtToken"}), recortado para mostrarlo. */
function motivoDe(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('body' in error) || typeof error.body !== 'string') return null
  const cuerpo = error.body.trim()
  if (cuerpo === '') return null
  try {
    const { reason } = JSON.parse(cuerpo) as { reason?: unknown }
    if (typeof reason === 'string') return reason.slice(0, 80)
  } catch {
    // No era JSON: se muestra el texto tal cual.
  }
  return cuerpo.slice(0, 80)
}

/**
 * Aviso de prueba para los dispositivos de una cuenta (o uno solo, por su `endpoint`): a diferencia de
 * enviarAUsuarios, cuenta qué respondió el servicio push, para poder explicarle a quien lo pidió por qué
 * un aviso no llega. Borra las suscripciones caducadas, como el envío normal.
 */
export async function enviarPrueba(usuarioId: string, endpoint?: string): Promise<ResultadoPrueba> {
  const admin = crearClienteAdmin()
  let consulta = admin.from('suscripciones_push').select('id, endpoint, p256dh, auth').eq('usuario_id', usuarioId)
  if (endpoint) consulta = consulta.eq('endpoint', endpoint)
  const { data: suscripciones, error } = await consulta
  if (error) throw error

  const resultado: ResultadoPrueba = { dispositivos: suscripciones.length, enviadas: 0, fallos: [] }
  if (suscripciones.length === 0) return resultado

  try {
    configurarVapid()
  } catch (errorConfiguracion) {
    console.error('[push] aviso de prueba: faltan variables VAPID', errorConfiguracion)
    return { ...resultado, sinConfiguracion: true }
  }

  const carga: CargaPush = {
    titulo: 'Aviso de prueba',
    cuerpo: 'Si lo ves, las notificaciones funcionan en este dispositivo.',
    url: '/configuraciones',
    etiqueta: 'aviso-de-prueba',
    renotificar: true,
  }
  const cuerpo = JSON.stringify(carga)
  const caducadas: string[] = []

  await Promise.all(
    suscripciones.map(async (s) => {
      if (!esEndpointPushPermitido(s.endpoint)) {
        resultado.fallos.push({ codigo: null, motivo: null } satisfies FalloEnvio)
        return
      }
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, {
          TTL: 60,
          urgency: 'high',
          timeout: ESPERA_ENVIO_MS,
        })
        resultado.enviadas++
      } catch (errorEnvio) {
        const codigo = codigoHttp(errorEnvio)
        const motivo = motivoDe(errorEnvio)
        console.error('[push] aviso de prueba: error al enviar', { suscripcion: s.id, codigo, motivo, host: hostDe(s.endpoint) })
        resultado.fallos.push({ codigo, motivo })
        if (codigo === 404 || codigo === 410) caducadas.push(s.id)
      }
    }),
  )

  if (caducadas.length > 0) {
    const { error: errorBorrado } = await admin.from('suscripciones_push').delete().in('id', caducadas)
    if (errorBorrado) console.error('[push] no se pudieron borrar suscripciones', errorBorrado)
  }
  return resultado
}
