export const TIEMPOS_COMIDA = ['desayuno', 'almuerzo', 'cena'] as const
export type TiempoComida = (typeof TIEMPOS_COMIDA)[number]

export const ETIQUETA_TIEMPO: Record<TiempoComida, string> = {
  desayuno: 'Desayuno',
  almuerzo: 'Almuerzo',
  cena: 'Cena',
}

export const ESTADOS_COMIDA = ['si', 'no', 'temprano', 'tarde', 'bolsa', 'enfermo'] as const
export type EstadoComida = (typeof ESTADOS_COMIDA)[number]

/** 'hora' = nota obligatoria HH:MM; 'texto' = nota obligatoria libre; null = sin nota. */
export type TipoNota = 'hora' | 'texto' | null

export const INFO_ESTADO: Record<EstadoComida, { etiqueta: string; nota: TipoNota; ayudaNota?: string }> = {
  si: { etiqueta: 'Sí comer', nota: null },
  no: { etiqueta: 'No comer', nota: null },
  temprano: { etiqueta: 'Comer temprano', nota: 'hora', ayudaNota: 'Hora a la que comerá' },
  tarde: { etiqueta: 'Comer tarde', nota: 'hora', ayudaNota: 'Hora a la que comerá' },
  bolsa: { etiqueta: 'En bolsa', nota: null },
  enfermo: { etiqueta: 'Enfermo', nota: 'texto', ayudaNota: 'Qué puede comer' },
}

export type OrigenSeleccion = 'persona' | 'plan'

export type HoraLimite = { diaRelativo: 0 | -1; hora: string }
export type HorasLimite = Record<TiempoComida, HoraLimite>

export const HORAS_LIMITE_POR_DEFECTO: HorasLimite = {
  desayuno: { diaRelativo: -1, hora: '21:00' },
  almuerzo: { diaRelativo: 0, hora: '10:00' },
  cena: { diaRelativo: 0, hora: '16:00' },
}

export type ValorComida = { estado: EstadoComida; nota: string | null }
export type SeleccionGuardada = ValorComida & { origen: OrigenSeleccion }
/** null = "Sin definir" */
export type ValorEfectivo = SeleccionGuardada | null
