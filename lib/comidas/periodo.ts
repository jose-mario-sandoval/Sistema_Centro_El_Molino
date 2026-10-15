import { sumarMeses, type FechaISO } from '@/lib/fechas'

export const MENSAJE_FUERA_DE_PERIODO = 'Solo podés cambiar comidas desde hoy hasta dentro de tres meses.'

/**
 * Ambos días incluidos. `hoy` debe proceder del reloj del servidor en ZONA_HORARIA.
 * Espejo de public.comida_editable(): hoy + interval '3 months', sin sumar días fijos
 * ni encadenar sumas de un mes (que perderían el día original al pasar por febrero).
 */
export function periodoEditable(hoy: FechaISO): { desde: FechaISO; hasta: FechaISO } {
  return { desde: hoy, hasta: sumarMeses(hoy, 3) }
}
