import { diaSemana, type FechaISO } from '@/lib/fechas'

export type ParametrosSerie =
  | { patron: 'semanal'; diaSemana: number }
  | { patron: 'mensual_dia_fijo'; diaMes: number }
  | { patron: 'mensual_dia_semana'; diaSemana: number; ordinalSemana: 1 | 2 | 3 | 4 | -1 }

function aNumeros(fecha: FechaISO): [number, number, number] {
  const [a, m, d] = fecha.split('-').map(Number)
  return [a, m, d]
}

function fechaDesdeUTC(anio: number, mes: number, dia: number): FechaISO {
  const fecha = new Date(Date.UTC(anio, mes - 1, dia))
  return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}-${String(fecha.getUTCDate()).padStart(2, '0')}`
}

function diasEnElMes(anio: number, mes: number): number {
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate()
}

function sumarDiasUTC(fecha: FechaISO, dias: number): FechaISO {
  const [a, m, d] = aNumeros(fecha)
  return fechaDesdeUTC(a, m, d + dias)
}

/** Cantidad de días entre dos FechaISO (>= 0 si hasta >= desde). */
export function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  const [a1, m1, d1] = aNumeros(desde)
  const [a2, m2, d2] = aNumeros(hasta)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000)
}

function semanal(dia: number, fechaInicio: FechaISO, fechaFin: FechaISO): FechaISO[] {
  const fechas: FechaISO[] = []
  let actual = fechaInicio
  while (actual <= fechaFin && diaSemana(actual) !== dia) actual = sumarDiasUTC(actual, 1)
  while (actual <= fechaFin) {
    fechas.push(actual)
    actual = sumarDiasUTC(actual, 7)
  }
  return fechas
}

function paraCadaMes(fechaInicio: FechaISO, fechaFin: FechaISO, calcular: (anio: number, mes: number) => FechaISO | null): FechaISO[] {
  const [anioInicio, mesInicio] = aNumeros(fechaInicio)
  const [anioFin, mesFin] = aNumeros(fechaFin)
  const fechas: FechaISO[] = []
  let anio = anioInicio
  let mes = mesInicio
  while (anio < anioFin || (anio === anioFin && mes <= mesFin)) {
    const fecha = calcular(anio, mes)
    if (fecha && fecha >= fechaInicio && fecha <= fechaFin) fechas.push(fecha)
    mes += 1
    if (mes > 12) {
      mes = 1
      anio += 1
    }
  }
  return fechas
}

function mensualDiaFijo(diaMes: number, fechaInicio: FechaISO, fechaFin: FechaISO): FechaISO[] {
  return paraCadaMes(fechaInicio, fechaFin, (anio, mes) => (diaMes <= diasEnElMes(anio, mes) ? fechaDesdeUTC(anio, mes, diaMes) : null))
}

function enesimoDiaSemanaDelMes(anio: number, mes: number, dia: number, n: number): FechaISO | null {
  let d = 1
  while (diaSemana(fechaDesdeUTC(anio, mes, d)) !== dia) d += 1
  d += (n - 1) * 7
  return d <= diasEnElMes(anio, mes) ? fechaDesdeUTC(anio, mes, d) : null
}

function ultimoDiaSemanaDelMes(anio: number, mes: number, dia: number): FechaISO {
  let d = diasEnElMes(anio, mes)
  while (diaSemana(fechaDesdeUTC(anio, mes, d)) !== dia) d -= 1
  return fechaDesdeUTC(anio, mes, d)
}

function mensualDiaSemana(dia: number, ordinal: 1 | 2 | 3 | 4 | -1, fechaInicio: FechaISO, fechaFin: FechaISO): FechaISO[] {
  return paraCadaMes(fechaInicio, fechaFin, (anio, mes) =>
    ordinal === -1 ? ultimoDiaSemanaDelMes(anio, mes, dia) : enesimoDiaSemanaDelMes(anio, mes, dia, ordinal),
  )
}

/** Genera las fechas de una serie entre fechaInicio y fechaFin (ambas incluidas), según el patrón. */
export function generarFechasSerie(parametros: ParametrosSerie, fechaInicio: FechaISO, fechaFin: FechaISO): FechaISO[] {
  if (parametros.patron === 'semanal') return semanal(parametros.diaSemana, fechaInicio, fechaFin)
  if (parametros.patron === 'mensual_dia_fijo') return mensualDiaFijo(parametros.diaMes, fechaInicio, fechaFin)
  return mensualDiaSemana(parametros.diaSemana, parametros.ordinalSemana, fechaInicio, fechaFin)
}
