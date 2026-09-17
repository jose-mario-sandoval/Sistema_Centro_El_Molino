import { z } from 'zod'
import { mensajeNota, normalizarNota, notaValida } from '@/lib/comidas/notas'
import { ESTADOS_COMIDA, TIEMPOS_COMIDA } from '@/lib/comidas/tipos'

const fecha = z.iso.date('Fecha inválida.')
const comida = z.enum(TIEMPOS_COMIDA, 'Comida inválida.')
const estado = z.enum(ESTADOS_COMIDA, 'Elegí una opción válida.')
const nota = z.string('Nota inválida.').nullish()
const MENSAJE_DIA = 'Día inválido.'

/** Selección de una comida en Semana (spec §6.4). */
export const esquemaSeleccion = z
  .object({ fecha, comida, estado, nota })
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

export const esquemaVolverAPlan = z.object({ fecha, comida })

export type DatosSeleccion = z.output<typeof esquemaSeleccion>
export type DatosPlan = z.output<typeof esquemaPlan>
