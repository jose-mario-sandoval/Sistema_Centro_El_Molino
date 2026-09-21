import type { FechaISO } from './index'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

/**
 * '21 de septiembre' · '21 al 25 de septiembre' · '28 de septiembre al 4 de octubre'.
 * Sin año: son fechas de la semana o del mes en curso, y así se leen más rápido.
 */
export function rangoLegible(desde: FechaISO, hasta: FechaISO): string {
  const [, mesInicio, diaInicio] = desde.split('-').map(Number)
  const [, mesFin, diaFin] = hasta.split('-').map(Number)
  const fin = `${diaFin} de ${MESES[mesFin - 1]}`
  if (desde === hasta) return fin
  return mesInicio === mesFin ? `${diaInicio} al ${fin}` : `${diaInicio} de ${MESES[mesInicio - 1]} al ${fin}`
}
