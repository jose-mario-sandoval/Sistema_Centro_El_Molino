import { z } from 'zod'

/**
 * Hosts de los servicios push de los navegadores que soporta la app (spec §8.2).
 * El endpoint lo elige el navegador, pero llega al servidor como dato del cliente: si no se
 * restringe, cualquiera con sesión puede guardar una URL arbitraria y hacer que el servidor
 * le mande peticiones (SSRF y amplificación).
 */
const HOSTS_PUSH_PERMITIDOS = [
  'fcm.googleapis.com', // Chrome, Edge y demás navegadores basados en Chromium
  'updates.push.services.mozilla.com', // Firefox
  'web.push.apple.com', // Safari e iOS
] as const

/** Windows (WNS) usa subdominios por región: <region>.notify.windows.com. */
const SUFIJO_WINDOWS = '.notify.windows.com'

/** ¿La URL es el endpoint https de un servicio push conocido? */
export function esEndpointPushPermitido(url: string): boolean {
  let analizada: URL
  try {
    analizada = new URL(url)
  } catch {
    return false
  }
  if (analizada.protocol !== 'https:') return false
  // Con credenciales en la URL (https://host@otro/) el host real no es el que se lee a simple vista.
  if (analizada.username !== '' || analizada.password !== '') return false

  const host = analizada.hostname.toLowerCase()
  if (HOSTS_PUSH_PERMITIDOS.includes(host as (typeof HOSTS_PUSH_PERMITIDOS)[number])) return true
  return host.length > SUFIJO_WINDOWS.length && host.endsWith(SUFIJO_WINDOWS)
}

const endpoint = z
  .url({ protocol: /^https$/, error: 'El endpoint debe ser una URL https.' })
  .max(2048)
  .refine(esEndpointPushPermitido, { error: 'El endpoint no es de un servicio push conocido.' })

/** Cuerpo de POST /api/push: PushSubscription.toJSON(). */
export const esquemaSuscripcionPush = z.object({
  endpoint,
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
})

/** Cuerpo de DELETE /api/push. */
export const esquemaBajaPush = z.object({ endpoint })

/** Entrada de actualizarPreferenciasAvisos. */
export const esquemaPreferenciasAvisos = z.object({
  avisarHoraLimite: z.boolean(),
  avisarMensajes: z.boolean(),
})
