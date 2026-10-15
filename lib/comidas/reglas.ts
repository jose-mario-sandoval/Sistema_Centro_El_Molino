import { fechaISOEn, instanteEnZona, sumarDias, type FechaISO } from '@/lib/fechas'
import { periodoEditable } from './periodo'
import type { HorasLimite, SeleccionGuardada, TiempoComida, ValorComida, ValorEfectivo } from './tipos'

/** Instante en que cierra `comida` de `fecha` (spec §6.1). */
export function cierreDe(fecha: FechaISO, comida: TiempoComida, horas: HorasLimite): Date {
  const { diaRelativo, hora } = horas[comida]
  return instanteEnZona(sumarDias(fecha, diaRelativo), hora)
}

/** Desde hoy hasta hoy + tres meses calendario, ambos incluidos, en hora local. */
export function enVentanaEditable(fecha: FechaISO, ahora: Date): boolean {
  const { desde, hasta } = periodoEditable(fechaISOEn(ahora))
  return fecha >= desde && fecha <= hasta
}

export function estaAbierta(p: {
  fecha: FechaISO
  comida: TiempoComida
  ahora: Date
  horas: HorasLimite
  cerrada: boolean
}): boolean {
  if (p.cerrada) return false
  if (!enVentanaEditable(p.fecha, p.ahora)) return false
  return p.ahora.getTime() < cierreDe(p.fecha, p.comida, p.horas).getTime()
}

/**
 * Espejo de public.comida_sin_cerrar(): la hora límite no pasó y el job no la cerró. A diferencia de
 * `estaAbierta`, no mira la ventana editable: decide si un extra manual todavía se puede quitar.
 */
export function comidaSinCerrar(p: {
  fecha: FechaISO
  comida: TiempoComida
  ahora: Date
  horas: HorasLimite
  cerrada: boolean
}): boolean {
  if (p.cerrada) return false
  return p.ahora.getTime() < cierreDe(p.fecha, p.comida, p.horas).getTime()
}

/** Lo que vale una comida cuando la persona está ausente: "No comer". */
export const VALOR_POR_AUSENCIA: SeleccionGuardada = { estado: 'no', nota: null, origen: 'ausencia' }

/**
 * Selección → ausencia → plan → "Sin definir" (null). Spec §6.2, con las ausencias.
 * La ausencia y el plan solo cuentan si la comida no cerró: al cerrar se congelan en una selección.
 * Una elección de la persona gana sobre la ausencia: así reactiva una comida puntual.
 */
export function valorEfectivo(p: {
  seleccion: SeleccionGuardada | null
  plan: ValorComida | null
  cerrada: boolean
  ausente?: boolean
}): ValorEfectivo {
  if (p.seleccion) return p.seleccion
  if (!p.cerrada && p.ausente) return VALOR_POR_AUSENCIA
  if (!p.cerrada && p.plan) return { estado: p.plan.estado, nota: p.plan.nota, origen: 'plan' }
  return null
}
