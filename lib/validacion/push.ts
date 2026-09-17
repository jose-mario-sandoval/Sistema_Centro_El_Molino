import { z } from 'zod'

const endpoint = z.url({ protocol: /^https$/, error: 'El endpoint debe ser una URL https.' }).max(2048)

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
