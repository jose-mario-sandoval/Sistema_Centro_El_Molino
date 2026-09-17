import { INFO_ESTADO, type EstadoComida } from './tipos'

/** Igual que el CHECK nota_valida de 02-A. */
const PATRON_HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const HORA_CON_SEGUNDOS = /^\d{2}:\d{2}:\d{2}$/
export const LARGO_MAXIMO_NOTA = 200

/** Deja la nota como la guarda la base: recortada, sin segundos y null si no corresponde. */
export function normalizarNota(estado: EstadoComida, nota: string | null | undefined): string | null {
  const tipo = INFO_ESTADO[estado].nota
  if (tipo === null) return null
  const recortada = (nota ?? '').trim()
  if (recortada === '') return null
  if (tipo === 'hora' && HORA_CON_SEGUNDOS.test(recortada)) return recortada.slice(0, 5)
  return recortada
}

/** Espejo de public.nota_valida(estado, nota). */
export function notaValida(estado: EstadoComida, nota: string | null): boolean {
  const tipo = INFO_ESTADO[estado].nota
  if (tipo === null) return nota === null
  if (nota === null) return false
  if (tipo === 'hora') return PATRON_HORA.test(nota)
  return nota.length >= 1 && nota.length <= LARGO_MAXIMO_NOTA
}

/** Texto para el aviso o el campo cuando la nota no es válida. */
export function mensajeNota(estado: EstadoComida): string {
  const { etiqueta, nota } = INFO_ESTADO[estado]
  if (nota === 'hora') return `Indicá la hora para "${etiqueta}" (HH:MM).`
  if (nota === 'texto') return `Indicá qué podés comer (hasta ${LARGO_MAXIMO_NOTA} caracteres).`
  return `"${etiqueta}" no lleva nota.`
}
