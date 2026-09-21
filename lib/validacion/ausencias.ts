import { z } from 'zod'
import { DIAS_MAXIMOS_AUSENCIA } from '@/lib/ausencias/tipos'
import { FECHA_MAXIMA, FECHA_MINIMA } from '@/lib/calendario/cuadricula'
import { esFechaISO } from '@/lib/comidas/semana'
import { sumarDias } from '@/lib/fechas'

// Mismos límites que los checks de la tabla ausencias.
const fecha = (mensaje: string) =>
  z.iso
    .date(mensaje)
    .refine((f) => f >= FECHA_MINIMA && f <= FECHA_MAXIMA, 'Fecha fuera de rango.')

/**
 * Salida y regreso de una ausencia, ambos días incluidos. Un solo día es desde = hasta.
 * Que el rango no haya pasado por completo depende de la fecha de hoy: lo comprueba la acción.
 */
export const esquemaAusencia = z
  .object({
    desde: fecha('Elegí el primer día que no vas a estar.'),
    hasta: fecha('Elegí el último día que no vas a estar.'),
  })
  .refine((d) => d.hasta >= d.desde, {
    message: 'El último día no puede ser anterior al primero.',
    path: ['hasta'],
  })
  // Solo con ambas fechas válidas: sumarDias lanza con una fecha que no existe, y el error de cada campo
  // ya lo reporta su propia regla. Sin este cuidado, una fecha mal escrita sería un error 500.
  .refine((d) => !esFechaISO(d.desde) || !esFechaISO(d.hasta) || d.hasta <= sumarDias(d.desde, DIAS_MAXIMOS_AUSENCIA), {
    message: 'Una ausencia puede durar hasta un año.',
    path: ['hasta'],
  })

export const esquemaQuitarAusencia = z.object({ id: z.uuid('Ausencia inválida.') })
