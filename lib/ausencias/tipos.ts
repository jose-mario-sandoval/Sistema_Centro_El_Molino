import type { FechaISO } from '@/lib/fechas'

/** Un rango de días, ambos incluidos. */
export type RangoAusencia = { desde: FechaISO; hasta: FechaISO }

/**
 * Una ausencia tal como la ven su dueña y el Director (Administración nunca: solo el efecto).
 * `marcadaPorOtro`: la marcó otra persona (el Director), no ella.
 */
export type Ausencia = RangoAusencia & { id: string; marcadaPorOtro: boolean }

/** La fila de la base (`creado_por` = quién la marcó si no fue la dueña) como la usa la app. */
export function ausenciaDesdeFila(fila: RangoAusencia & { id: string; creado_por: string | null }): Ausencia {
  return { id: fila.id, desde: fila.desde, hasta: fila.hasta, marcadaPorOtro: fila.creado_por !== null }
}

/** ¿Algún rango cubre ese día? Las fechas ISO se comparan como texto. */
export function estaAusente(ausencias: readonly RangoAusencia[], fecha: FechaISO): boolean {
  return ausencias.some((a) => a.desde <= fecha && fecha <= a.hasta)
}

/** Máximo de días que puede durar una ausencia: el mismo límite que la base de datos. */
export const DIAS_MAXIMOS_AUSENCIA = 365
