import { z } from 'zod'
import { diasEntre } from '@/lib/calendario/recurrencia'
import { FECHA_MAXIMA, FECHA_MINIMA } from '@/lib/calendario/cuadricula'
import { REQUERIMIENTOS_COCINA, TIPOS_EVENTO, type RequerimientoCocina } from '@/lib/calendario/tipos'
import { TIEMPOS_COMIDA } from '@/lib/comidas/tipos'

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

export const esquemaCrearEnlace = z.object({
  evento_id: z.uuid('Evento inválido.'),
  tiempo_comida: z.enum(TIEMPOS_COMIDA, { error: 'Elegí el tiempo de comida.' }),
  fecha_vencimiento: z.iso.date('Fecha inválida.'),
  hora_vencimiento: z.string('Hora inválida.').trim().regex(PATRON_HORA, 'Usá el formato HH:MM.'),
})

export const esquemaRevocarEnlace = z.object({ id: z.uuid('Enlace inválido.') })

export const esquemaListarEnlaces = z.object({ evento_id: z.uuid('Evento inválido.') })

export const esquemaConfirmarCena = z.object({
  token: z.string('Enlace inválido.').min(1, 'Enlace inválido.'),
  nombre: z.string('Escribí tu nombre.').trim().min(1, 'Escribí tu nombre.').max(120, 'El nombre puede tener hasta 120 caracteres.'),
  cantidad_personas: z.coerce
    .number('Escribí un número.')
    .int('Escribí un número entero.')
    .min(1, 'Mínimo 1 persona.')
    .max(10, 'Máximo 10 personas.'),
})

export type DatosEvento = z.output<typeof esquemaEvento>

/**
 * Campos de una serie recurrente tal como llegan del formulario. Los campos numéricos
 * (`dia_semana`, `ordinal_semana`, `dia_mes`) llegan como texto y se convierten acá.
 * Cuáles son obligatorios depende de `patron` — se valida en el `superRefine`.
 */
export const esquemaSerieEventos = z
  .object({
    titulo: z.string(MENSAJE_TITULO).trim().min(1, MENSAJE_TITULO).max(120, 'El título puede tener hasta 120 caracteres.'),
    hora: z.string('Hora inválida.').trim()
      .refine((hora) => hora === '' || PATRON_HORA.test(hora), 'Usá el formato HH:MM.')
      .transform((hora) => (hora === '' ? null : hora)),
    tipo: z.enum(TIPOS_EVENTO, { error: 'Elegí el tipo de evento.' }),
    requiere_cocina: z.array(z.enum(REQUERIMIENTOS_COCINA, { error: 'Pedido a la cocina inválido.' })).refine(requerimientosValidos, {
      message: '"Utensilios y materiales" no se combina con merienda ni comida.',
    }),
    requiere_otro_texto: z.string().trim().max(200, 'El pedido puede tener hasta 200 caracteres.').transform((v) => (v === '' ? null : v)),
    patron: z.enum(['semanal', 'mensual_dia_fijo', 'mensual_dia_semana'], { error: 'Elegí cómo se repite.' }),
    dia_semana: z.coerce.number('Elegí el día de la semana.').int().min(1).max(7).optional(),
    ordinal_semana: z.coerce.number('Elegí cuál.').int().refine((n) => [1, 2, 3, 4, -1].includes(n), 'Elegí una opción válida.').optional(),
    dia_mes: z.coerce.number('Elegí el día del mes.').int().min(1).max(31).optional(),
    fecha_inicio: z.iso.date('Fecha inválida.').refine((f) => f >= FECHA_MINIMA && f <= FECHA_MAXIMA, 'Fecha fuera de rango.'),
    fecha_fin: z.iso.date('Fecha inválida.').refine((f) => f >= FECHA_MINIMA && f <= FECHA_MAXIMA, 'Fecha fuera de rango.'),
  })
  .superRefine((datos, ctx) => {
    if (datos.fecha_fin < datos.fecha_inicio) {
      ctx.addIssue({ code: 'custom', path: ['fecha_fin'], message: 'La fecha de fin no puede ser anterior al inicio.' })
    } else if (diasEntre(datos.fecha_inicio, datos.fecha_fin) > 730) {
      ctx.addIssue({ code: 'custom', path: ['fecha_fin'], message: 'La serie no puede durar más de 730 días.' })
    }
    if (datos.patron === 'semanal' && datos.dia_semana === undefined) {
      ctx.addIssue({ code: 'custom', path: ['dia_semana'], message: 'Elegí el día de la semana.' })
    }
    if (datos.patron === 'mensual_dia_fijo' && datos.dia_mes === undefined) {
      ctx.addIssue({ code: 'custom', path: ['dia_mes'], message: 'Elegí el día del mes.' })
    }
    if (datos.patron === 'mensual_dia_semana') {
      if (datos.dia_semana === undefined) ctx.addIssue({ code: 'custom', path: ['dia_semana'], message: 'Elegí el día de la semana.' })
      if (datos.ordinal_semana === undefined) ctx.addIssue({ code: 'custom', path: ['ordinal_semana'], message: 'Elegí cuál (primero, segundo… o último).' })
    }
  })

export const esquemaEliminarSerie = z.object({ serie_id: z.uuid('Serie inválida.') })
