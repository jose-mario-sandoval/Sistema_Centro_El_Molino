import { MESES } from './etiquetas'
import type { FechaISO } from './index'

/**
 * '21 de septiembre' · '21 al 25 de septiembre' · '28 de septiembre al 4 de octubre'.
 * Sin año mientras el rango no cambie de año: son fechas cercanas y así se leen más rápido. Si cruza
 * de año, el año va en las dos puntas ('28 de diciembre de 2026 al 3 de enero de 2027'): sin él, una
 * ausencia de casi un año se leería "26 al 26 de septiembre".
 */
export function rangoLegible(desde: FechaISO, hasta: FechaISO): string {
  const [anioInicio, mesInicio, diaInicio] = desde.split('-').map(Number)
  const [anioFin, mesFin, diaFin] = hasta.split('-').map(Number)
  const fin = `${diaFin} de ${MESES[mesFin - 1]}`
  if (desde === hasta) return fin
  if (anioInicio !== anioFin) return `${diaInicio} de ${MESES[mesInicio - 1]} de ${anioInicio} al ${fin} de ${anioFin}`
  return mesInicio === mesFin ? `${diaInicio} al ${fin}` : `${diaInicio} de ${MESES[mesInicio - 1]} al ${fin}`
}
