import type { FechaISO } from '@/lib/fechas'

/** Un rango de días, ambos incluidos. */
export type RangoAusencia = { desde: FechaISO; hasta: FechaISO }

/** Una ausencia tal como la ve su dueña. Las ausencias son privadas: solo ella las conoce. */
export type Ausencia = RangoAusencia & { id: string }

/** ¿Algún rango cubre ese día? Las fechas ISO se comparan como texto. */
export function estaAusente(ausencias: readonly RangoAusencia[], fecha: FechaISO): boolean {
  return ausencias.some((a) => a.desde <= fecha && fecha <= a.hasta)
}

/** Máximo de días que puede durar una ausencia: el mismo límite que la base de datos. */
export const DIAS_MAXIMOS_AUSENCIA = 365
