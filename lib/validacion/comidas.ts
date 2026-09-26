import { z } from 'zod'
import { FECHA_MAXIMA, FECHA_MINIMA } from '@/lib/calendario/cuadricula'
import { mensajeNota, normalizarNota, notaValida } from '@/lib/comidas/notas'
import { ESTADOS_COMIDA, TIEMPOS_COMIDA } from '@/lib/comidas/tipos'

const fecha = z.iso.date('Fecha inválida.')
const comida = z.enum(TIEMPOS_COMIDA, 'Comida inválida.')
const estado = z.enum(ESTADOS_COMIDA, 'Elegí una opción válida.')
const nota = z.string('Nota inválida.').nullish()
const MENSAJE_DIA = 'Día inválido.'
/**
 * De quién son las comidas. Sin él, las de quien tiene la sesión; con él, las de otra persona
 * (solo el Director: lo decide `usuarioObjetivo()` y lo vuelve a exigir la base).
 */
const usuarioId = z.uuid('Persona inválida.').optional()

/** Selección de una comida en Semana (spec §6.4). */
export const esquemaSeleccion = z
  .object({ fecha, comida, estado, nota, usuarioId })
  .superRefine((valor, ctx) => {
    if (!notaValida(valor.estado, normalizarNota(valor.estado, valor.nota))) {
      ctx.addIssue({ code: 'custom', path: ['nota'], message: mensajeNota(valor.estado) })
    }
  })
  .transform((valor) => ({ ...valor, nota: normalizarNota(valor.estado, valor.nota) }))

/** Una celda del Plan semanal. `estado: null` = "Sin definir" (borra la fila). */
export const esquemaPlan = z
  .object({
    diaSemana: z.number(MENSAJE_DIA).int(MENSAJE_DIA).min(1, MENSAJE_DIA).max(7, MENSAJE_DIA),
    comida,
    estado: estado.nullable(),
    nota,
    usuarioId,
  })
  .superRefine((valor, ctx) => {
    if (valor.estado !== null && !notaValida(valor.estado, normalizarNota(valor.estado, valor.nota))) {
      ctx.addIssue({ code: 'custom', path: ['nota'], message: mensajeNota(valor.estado) })
    }
  })
  .transform((valor) => ({
    ...valor,
    nota: valor.estado === null ? null : normalizarNota(valor.estado, valor.nota),
  }))

export const esquemaVolverAPlan = z.object({ fecha, comida, usuarioId })

/** Igual que los checks de extras_manuales. */
export const CANTIDAD_MAXIMA_EXTRA = 50
export const LARGO_MAXIMO_NOTA_EXTRA = 200
const MENSAJE_CANTIDAD = `Indicá cuántas personas, de 1 a ${CANTIDAD_MAXIMA_EXTRA}.`

/**
 * Un extra manual para la cocina (solo el Director). La cantidad puede llegar como texto desde un
 * formulario; la nota llega recortada y vacía = sin nota. Que la fecha no haya pasado depende de
 * hoy: lo comprueba la acción (y la base).
 */
export const esquemaExtra = z.object({
  fecha: z.iso
    .date('Elegí el día.')
    .refine((f) => f >= FECHA_MINIMA && f <= FECHA_MAXIMA, 'Fecha fuera de rango.'),
  comida,
  cantidad: z.coerce
    .number(MENSAJE_CANTIDAD)
    .int(MENSAJE_CANTIDAD)
    .min(1, MENSAJE_CANTIDAD)
    .max(CANTIDAD_MAXIMA_EXTRA, MENSAJE_CANTIDAD),
  nota: z
    .string('Nota inválida.')
    .trim()
    .max(LARGO_MAXIMO_NOTA_EXTRA, `La nota puede tener hasta ${LARGO_MAXIMO_NOTA_EXTRA} caracteres.`)
    .nullish()
    .transform((texto) => texto || null),
})

export const esquemaQuitarExtra = z.object({ id: z.uuid('Extra inválido.') })

export type DatosSeleccion = z.output<typeof esquemaSeleccion>
export type DatosPlan = z.output<typeof esquemaPlan>
export type DatosExtra = z.output<typeof esquemaExtra>
