import { z } from 'zod'

const PATRON_HORA = /^([01]\d|2[0-3]):[0-5]\d$/

const MENSAJE_TITULO = 'Escribí el título del evento.'

/** Campos de un evento tal como llegan del formulario. `hora` vacía = sin hora (null). */
export const esquemaEvento = z.object({
  titulo: z
    .string(MENSAJE_TITULO)
    .trim()
    .min(1, MENSAJE_TITULO)
    .max(120, 'El título puede tener hasta 120 caracteres.'),
  fecha: z.iso.date('Fecha inválida.'),
  hora: z
    .string('Hora inválida.')
    .trim()
    .refine((hora) => hora === '' || PATRON_HORA.test(hora), 'Usá el formato HH:MM.')
    .transform((hora) => (hora === '' ? null : hora)),
})

export const esquemaEditarEvento = esquemaEvento.extend({
  id: z.uuid('Evento inválido.'),
})

export const esquemaEliminarEvento = z.object({
  id: z.uuid('Evento inválido.'),
})

export type DatosEvento = z.output<typeof esquemaEvento>
