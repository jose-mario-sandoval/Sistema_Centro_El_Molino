import { z } from 'zod'
import { LARGO_MAXIMO_MENSAJE } from '@/lib/mensajes/feed'

const texto = z
  .string({ error: 'Escribí un mensaje.' })
  .trim()
  .min(1, 'Escribí un mensaje.')
  .max(LARGO_MAXIMO_MENSAJE, `El mensaje no puede tener más de ${LARGO_MAXIMO_MENSAJE} caracteres.`)

const idMensaje = z.uuid({ error: 'Mensaje inválido.' })

/** Formulario "Publicar". `id`: lo genera el navegador para que reintentar no duplique (lib/mensajes/envio.ts). */
export const esquemaPublicacion = z.object({ id: idMensaje, texto })

/** Formulario de respuesta bajo una publicación. `id`: igual que en la publicación. */
export const esquemaRespuesta = z.object({ id: idMensaje, padreId: idMensaje, texto })

/** `presente`: estado final deseado de la reacción propia (idempotente). */
export const esquemaReaccion = z.object({
  mensajeId: idMensaje,
  presente: z.boolean({ error: 'Reacción inválida.' }),
})

export const esquemaBorrado = z.object({ id: idMensaje })

export const esquemaModeracion = z.object({
  id: idMensaje,
  estado: z.enum(['aprobado', 'rechazado'], { error: 'Elegí aprobar o rechazar.' }),
  texto: texto.optional(),
  motivoRechazo: z.string().trim().max(500, 'El motivo puede tener hasta 500 caracteres.').optional(),
})

export const esquemaEdicionPropia = z.object({ id: idMensaje, texto })

/** "Ver anteriores": `antesDe` es el creado_en de la publicación más antigua cargada; null = primera página. */
export const esquemaPaginaMensajes = z.object({
  antesDe: z.iso.datetime({ offset: true, error: 'Fecha inválida.' }).nullable().default(null),
})
