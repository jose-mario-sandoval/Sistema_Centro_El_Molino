import { INFO_ESTADO, type EstadoComida, type ValorComida } from './tipos'

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

/**
 * Con qué empieza el campo al elegir `estado`, según lo que había (lo guardado o lo que se estaba
 * escribiendo): la misma nota si el tipo coincide (temprano ↔ tarde conservan la hora), si no vacío.
 * Igual en Plan y Semana; la nota se confirma siempre con "Guardar".
 */
export function notaInicial(anterior: ValorComida | null, estado: EstadoComida): string {
  if (!anterior?.nota) return ''
  const tipo = INFO_ESTADO[estado].nota
  return tipo !== null && INFO_ESTADO[anterior.estado].nota === tipo ? anterior.nota : ''
}

/** Un estado que lleva nota, elegido y todavía sin guardar, con lo escrito en el campo. */
export type Borrador = { estado: EstadoComida; nota: string }

export type DecisionBorrador =
  | { tipo: 'nada' }
  | { tipo: 'guardar'; valor: ValorComida }
  | { tipo: 'error'; mensaje: string }

/**
 * Qué hacer con lo escrito al tocar "Guardar" o al cerrar ("Listo", volver a tocar la comida, pasar a
 * otra): una nota válida y distinta de lo guardado se guarda; igual o sin borrador, nada; vacía o
 * inválida, la burbuja no se cierra y dice por qué. Nunca se pierde en silencio lo que se escribió.
 * Escape y "Cancelar" son los únicos que descartan, y no pasan por acá.
 */
export function resolverBorrador(
  borrador: Borrador | null,
  guardado: ValorComida | null,
  { alCerrar, voz = 'propia' }: { alCerrar: boolean; voz?: 'propia' | 'ajena' },
): DecisionBorrador {
  if (!borrador) return { tipo: 'nada' }
  const nota = normalizarNota(borrador.estado, borrador.nota)
  if (!notaValida(borrador.estado, nota)) {
    const salida = alCerrar ? ' Si no querés cambiarla, tocá "Cancelar".' : ''
    return { tipo: 'error', mensaje: mensajeNota(borrador.estado, voz) + salida }
  }
  if (guardado?.estado === borrador.estado && guardado.nota === nota) return { tipo: 'nada' }
  return { tipo: 'guardar', valor: { estado: borrador.estado, nota } }
}

/**
 * Texto para el aviso o el campo cuando la nota no es válida. `voz` 'ajena': el Director escribe la
 * nota de otra persona ("qué puede comer").
 */
export function mensajeNota(estado: EstadoComida, voz: 'propia' | 'ajena' = 'propia'): string {
  const { etiqueta, nota } = INFO_ESTADO[estado]
  if (nota === 'hora') return `Indicá la hora para "${etiqueta}" (HH:MM).`
  if (nota === 'texto') return `Indicá qué ${voz === 'propia' ? 'podés' : 'puede'} comer (hasta ${LARGO_MAXIMO_NOTA} caracteres).`
  return `"${etiqueta}" no lleva nota.`
}
