import type { SeleccionGuardada, TiempoComida, TipoNota } from './tipos'

/**
 * Quién mira las comidas. 'propia': la persona mira las suyas ("¿Vas a almorzar…?"). 'ajena': el
 * Director mira las de otra persona en La casa ("¿Va a almorzar…?"). Voseo salvadoreño en las dos.
 */
export type Voz = 'propia' | 'ajena'

/** Solo un Director puede cambiar la comida de otra persona: por eso se nombra el rol. */
export const CAMBIADA_POR_EL_DIRECTOR = 'la cambió el Director'
export const MARCADA_POR_EL_DIRECTOR = 'La marcó el Director'

const VERBO: Record<TiempoComida, string> = { desayuno: 'desayunar', almuerzo: 'almorzar', cena: 'cenar' }

/** '¿Vas a almorzar el miércoles?' · '¿Va a almorzar el miércoles?' (`dia`: 'Miércoles'). */
export function preguntaComida(comida: TiempoComida, dia: string, voz: Voz): string {
  return `¿${voz === 'propia' ? 'Vas' : 'Va'} a ${VERBO[comida]} el ${dia.toLowerCase()}?`
}

/** 'según tu plan' · 'por su ausencia' · 'cambiada' · 'la cambió el Director'. */
export function textoOrigen(valor: SeleccionGuardada, voz: Voz): string {
  if (valor.origen === 'persona') return valor.cambiadaPorOtro ? CAMBIADA_POR_EL_DIRECTOR : 'cambiada'
  const posesivo = voz === 'propia' ? 'tu' : 'su'
  return valor.origen === 'ausencia' ? `por ${posesivo} ausencia` : `según ${posesivo} plan`
}

/** El botón que borra la excepción y deja rigiendo la referencia del día. */
export function textoVolver(ausente: boolean, voz: Voz): string {
  return `Volver a ${voz === 'propia' ? 'mi' : 'su'} ${ausente ? 'ausencia' : 'plan'}`
}

/** Etiqueta del campo de la nota: la hora (temprano/tarde) o qué puede comer (enfermo). */
export function etiquetaNota(tipo: NonNullable<TipoNota>, voz: Voz): string {
  if (tipo === 'hora') return 'Hora'
  return voz === 'propia' ? 'Qué podés comer' : 'Qué puede comer'
}

export function avisoAusenciaMarcada(voz: Voz): string {
  return `Ausencia marcada. ${voz === 'propia' ? 'Tus' : 'Sus'} comidas de esos días quedan canceladas.`
}

export function avisoAusenciaQuitada(voz: Voz): string {
  return voz === 'propia'
    ? 'Ausencia quitada. Tus comidas vuelven a tu plan.'
    : 'Ausencia quitada. Sus comidas vuelven a su plan.'
}
