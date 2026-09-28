import { diaSemana, type FechaISO } from './index'

/**
 * Nombres de fecha escritos a mano, sin `Intl`: el servidor y el navegador dicen exactamente lo mismo
 * (el navegador de cada persona trae sus propios datos de idioma, y un componente cliente que armara
 * la etiqueta con `Intl` podría no coincidir con lo que pintó el servidor).
 */

/** En minúscula: van en medio de la frase ("16 de septiembre"). */
export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

/** Lunes primero, como la cuadrícula del calendario. Índice = diaSemana(fecha) - 1. */
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const

function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/** '2026-09' → 'Septiembre de 2026' */
export function etiquetaMesLarga(mes: string): string {
  const [anio, numero] = mes.split('-').map(Number)
  return `${conMayuscula(MESES[numero - 1])} de ${anio}`
}

/** '2026-09-16' → 'Miércoles, 16 de septiembre de 2026'. Con año: puede ser de otro mes o año. */
export function etiquetaDiaLarga(fecha: FechaISO): string {
  const [anio, mes, dia] = fecha.split('-').map(Number)
  return `${DIAS_SEMANA[diaSemana(fecha) - 1]}, ${dia} de ${MESES[mes - 1]} de ${anio}`
}
