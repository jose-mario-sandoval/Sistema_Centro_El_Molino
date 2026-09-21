import { diaSemana, fechaISOEn, horaHHMM, lunesDe, sumarDias, type FechaISO } from '@/lib/fechas'
import { cierreDe, enVentanaEditable, estaAbierta } from './reglas'
import { ETIQUETA_TIEMPO, type HorasLimite, type TiempoComida } from './tipos'

export const NOMBRES_DIA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const
const DIAS_CORTOS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'] as const
const ARTICULO: Record<TiempoComida, string> = { desayuno: 'El', almuerzo: 'El', cena: 'La' }

export type TipoSemana = 'pasada' | 'actual' | 'siguiente'

const PATRON_FECHA = /^20\d{2}-\d{2}-\d{2}$/

/** 'YYYY-MM-DD' de un día que existe (años 2000–2099). */
export function esFechaISO(valor: unknown): valor is FechaISO {
  return typeof valor === 'string' && PATRON_FECHA.test(valor) && sumarDias(valor, 0) === valor
}

/** 'Miércoles' */
export function nombreDia(fecha: FechaISO): string {
  return NOMBRES_DIA[diaSemana(fecha) - 1]
}

/** '23/9' */
export function fechaCorta(fecha: FechaISO): string {
  const [, mes, dia] = fecha.split('-')
  return `${Number(dia)}/${Number(mes)}`
}

/** 'Miércoles 23/9' */
export function etiquetaDia(fecha: FechaISO): string {
  return `${nombreDia(fecha)} ${fechaCorta(fecha)}`
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

/** '14 al 20 de septiembre' · '28 de septiembre al 4 de octubre' */
export function rangoSemana(lunes: FechaISO): string {
  const [, mesInicio, diaInicio] = lunes.split('-').map(Number)
  const [, mesFin, diaFin] = sumarDias(lunes, 6).split('-').map(Number)
  const fin = `${diaFin} de ${MESES[mesFin - 1]}`
  return mesInicio === mesFin ? `${diaInicio} al ${fin}` : `${diaInicio} de ${MESES[mesInicio - 1]} al ${fin}`
}

export function diasDeSemana(lunes: FechaISO): FechaISO[] {
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i))
}

/** Lunes de la semana pedida en `?semana=`. Inválida o posterior a la siguiente → semana actual. */
export function semanaPedida(valor: unknown, hoy: FechaISO): FechaISO {
  const lunesActual = lunesDe(hoy)
  if (!esFechaISO(valor)) return lunesActual
  const lunes = lunesDe(valor)
  return lunes > sumarDias(lunesActual, 7) ? lunesActual : lunes
}

export function tipoSemana(lunes: FechaISO, hoy: FechaISO): TipoSemana {
  const lunesActual = lunesDe(hoy)
  if (lunes < lunesActual) return 'pasada'
  return lunes === lunesActual ? 'actual' : 'siguiente'
}

export function navegacionSemana(
  lunes: FechaISO,
  hoy: FechaISO,
): { anterior: FechaISO; siguiente: FechaISO | null; tipo: TipoSemana } {
  const tipo = tipoSemana(lunes, hoy)
  return { anterior: sumarDias(lunes, -7), siguiente: tipo === 'siguiente' ? null : sumarDias(lunes, 7), tipo }
}

/** Día pedido en `?dia=` si pertenece a la semana; si no, hoy (si está en la semana) o el lunes. */
export function diaPedido(valor: unknown, lunes: FechaISO, hoy: FechaISO): FechaISO {
  const dias = diasDeSemana(lunes)
  if (esFechaISO(valor) && dias.includes(valor)) return valor
  return dias.includes(hoy) ? hoy : lunes
}

/** 'cierra hoy 10:00' · 'cierra mañana 21:00' · 'cierra mié 23/9 10:00' · 'cerrada' (spec §6.5). */
export function textoCierre(p: {
  fecha: FechaISO
  comida: TiempoComida
  ahora: Date
  horas: HorasLimite
  cerrada: boolean
}): string {
  if (!estaAbierta(p)) return 'cerrada'
  const diaCierre = fechaISOEn(cierreDe(p.fecha, p.comida, p.horas))
  const hora = horaHHMM(p.horas[p.comida].hora)
  const hoy = fechaISOEn(p.ahora)
  if (diaCierre === hoy) return `cierra hoy ${hora}`
  if (diaCierre === sumarDias(hoy, 1)) return `cierra mañana ${hora}`
  return `cierra ${DIAS_CORTOS[diaSemana(diaCierre) - 1]} ${fechaCorta(diaCierre)} ${hora}`
}

/** Texto del error MOL01 (spec §6.4): fuera de ventana, pasó la hora o ya la cerró la tarea. */
export function mensajeComidaCerrada(p: { fecha: FechaISO; comida: TiempoComida; ahora: Date; horas: HorasLimite }): string {
  if (!enVentanaEditable(p.fecha, p.ahora)) return 'Solo podés cambiar la semana actual y la siguiente.'
  const nombre = `${ARTICULO[p.comida]} ${ETIQUETA_TIEMPO[p.comida].toLowerCase()}`
  if (p.ahora.getTime() < cierreDe(p.fecha, p.comida, p.horas).getTime()) return `${nombre} ya cerró.`
  const { diaRelativo, hora } = p.horas[p.comida]
  return diaRelativo === -1
    ? `${nombre} ya cerró a las ${horaHHMM(hora)} del día anterior.`
    : `${nombre} ya cerró a las ${horaHHMM(hora)}.`
}
