import 'server-only'
import { sendNotification, setVapidDetails } from 'web-push'
import { variableEntorno } from '@/lib/entorno'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { esEndpointPushPermitido } from '@/lib/validacion/push'
import type { CargaPush } from './mensajes-push'

export type ResumenEnvio = { enviadas: number; caducadas: number; fallidas: number; descartadas: number }

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
  opciones: { ttlSegundos?: number } = {},
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
  const cuerpo = JSON.stringify(carga)
  const caducadas: string[] = []
  const descartadas: string[] = []

  await Promise.all(
    suscripciones.map(async (s) => {
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
