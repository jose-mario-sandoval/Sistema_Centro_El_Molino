import { z } from 'zod'
import { LARGO_MAXIMO_MENSAJE } from '@/lib/mensajes/feed'
import { DURACIONES_FIJADO } from '@/lib/mensajes/fijados'

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

/** Fijar una publicación. El fin lo calcula el servidor con su reloj (lib/mensajes/fijados.ts). */
export const esquemaFijar = z
  .object({
    id: idMensaje,
    duracion: z.enum(DURACIONES_FIJADO, { error: 'Elegí por cuánto tiempo.' }),
    fecha: z.iso.date({ error: 'Elegí hasta qué día.' }).optional(),
  })
  .refine((d) => d.duracion !== 'fecha' || d.fecha !== undefined, {
    path: ['fecha'],
    error: 'Elegí hasta qué día.',
  })

export const esquemaDesfijar = z.object({ id: idMensaje })

/** Traer una sola publicación completa (una que llegó por tiempo real y no estaba cargada). */
export const esquemaCargarPublicacion = z.object({ id: idMensaje })

/** "Ver anteriores": `antesDe` es el creado_en de la publicación más antigua cargada; null = primera página. */
export const esquemaPaginaMensajes = z.object({
  antesDe: z.iso.datetime({ offset: true, error: 'Fecha inválida.' }).nullable().default(null),
})
