import { z } from 'zod'
import { FECHA_MAXIMA, FECHA_MINIMA } from '@/lib/calendario/cuadricula'
import { REQUERIMIENTOS_COCINA, TIPOS_EVENTO, type RequerimientoCocina } from '@/lib/calendario/tipos'

const PATRON_HORA = /^([01]\d|2[0-3]):[0-5]\d$/

const MENSAJE_TITULO = 'Escribí el título del evento.'

/** Mismas reglas que `requiere_cocina_valido` en la base: sin repetidos, y "solo materiales" va solo. */
export function requerimientosValidos(requerimientos: readonly RequerimientoCocina[]): boolean {
  if (new Set(requerimientos).size !== requerimientos.length) return false
  return !(requerimientos.includes('materiales') && requerimientos.length > 1)
}

/**
 * Campos de un evento tal como llegan del formulario. `hora` vacía = sin hora (null).
 * El título se recorta aquí: la base exige titulo = btrim(titulo).
 */
export const esquemaEvento = z.object({
  titulo: z
    .string(MENSAJE_TITULO)
    .trim()
    .min(1, MENSAJE_TITULO)
    .max(120, 'El título puede tener hasta 120 caracteres.'),
  // Comparar como texto sirve: z.iso.date ya garantiza el formato YYYY-MM-DD.
  fecha: z.iso
    .date('Fecha inválida.')
    .refine((fecha) => fecha >= FECHA_MINIMA && fecha <= FECHA_MAXIMA, 'Fecha fuera de rango.'),
  hora: z
    .string('Hora inválida.')
    .trim()
    .refine((hora) => hora === '' || PATRON_HORA.test(hora), 'Usá el formato HH:MM.')
    .transform((hora) => (hora === '' ? null : hora)),
  tipo: z.enum(TIPOS_EVENTO, { error: 'Elegí el tipo de evento.' }),
  // Sin nada marcado = el evento no le pide nada a la cocina.
  requiere_cocina: z
    .array(z.enum(REQUERIMIENTOS_COCINA, { error: 'Pedido a la cocina inválido.' }))
    .refine(requerimientosValidos, {
      message: '"Utensilios y materiales" no se combina con merienda ni comida.',
    }),
  requiere_otro_texto: z
    .string('Pedido inválido.')
    .trim()
    .max(200, 'El pedido puede tener hasta 200 caracteres.')
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : v)),
})

export const esquemaEditarEvento = esquemaEvento.extend({
  id: z.uuid('Evento inválido.'),
})

export const esquemaEliminarEvento = z.object({
  id: z.uuid('Evento inválido.'),
})

export type DatosEvento = z.output<typeof esquemaEvento>
