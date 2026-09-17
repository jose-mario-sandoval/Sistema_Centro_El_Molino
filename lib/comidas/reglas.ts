import { fechaISOEn, instanteEnZona, lunesDe, sumarDias, type FechaISO } from '@/lib/fechas'
import type { HorasLimite, SeleccionGuardada, TiempoComida, ValorComida, ValorEfectivo } from './tipos'

/** Instante en que cierra `comida` de `fecha` (spec §6.1). */
export function cierreDe(fecha: FechaISO, comida: TiempoComida, horas: HorasLimite): Date {
  const { diaRelativo, hora } = horas[comida]
  return instanteEnZona(sumarDias(fecha, diaRelativo), hora)
}

/** Semana actual (desde su lunes) y la siguiente (hasta su domingo), en hora local. */
export function enVentanaEditable(fecha: FechaISO, ahora: Date): boolean {
  const lunesActual = lunesDe(fechaISOEn(ahora))
  const domingoSiguiente = sumarDias(lunesActual, 13)
  return fecha >= lunesActual && fecha <= domingoSiguiente
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

/** Selección → plan (solo si la comida no cerró) → "Sin definir" (null). Spec §6.2. */
export function valorEfectivo(p: {
  seleccion: SeleccionGuardada | null
  plan: ValorComida | null
  cerrada: boolean
}): ValorEfectivo {
  if (p.seleccion) return p.seleccion
  if (!p.cerrada && p.plan) return { estado: p.plan.estado, nota: p.plan.nota, origen: 'plan' }
  return null
}
