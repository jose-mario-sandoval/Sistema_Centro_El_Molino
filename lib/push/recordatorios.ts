import { cierreDe } from '@/lib/comidas/reglas'
import { HORAS_LIMITE_POR_DEFECTO, TIEMPOS_COMIDA, type HorasLimite, type TiempoComida } from '@/lib/comidas/tipos'
import { fechaISOEn, horaHHMM, sumarDias, type FechaISO } from '@/lib/fechas'

export const MINUTOS_DE_ANTICIPACION = 60

export type ComidaFecha = { fecha: FechaISO; comida: TiempoComida }
export type ComidaPorAvisar = ComidaFecha & { cierre: Date }

/** Fila de la tabla `horas_limite`. */
export type FilaHoraLimite = { comida: TiempoComida; dia_relativo: number; hora: string }

export function horasLimiteDesdeFilas(filas: FilaHoraLimite[]): HorasLimite {
  const horas: HorasLimite = { ...HORAS_LIMITE_POR_DEFECTO }
  for (const fila of filas) {
    horas[fila.comida] = { diaRelativo: fila.dia_relativo === -1 ? -1 : 0, hora: horaHHMM(fila.hora) }
  }
  return horas
}

function clave(c: ComidaFecha): string {
  return `${c.fecha}|${c.comida}`
}

/** Comidas cuyo cierre ocurre en (ahora, ahora + 60 min], sin cerrar ni avisar (spec §8.3). */
export function comidasPorAvisar(p: {
  ahora: Date
  horas: HorasLimite
  cerradas: ComidaFecha[]
  avisadas: ComidaFecha[]
}): ComidaPorAvisar[] {
  const excluidas = new Set([...p.cerradas, ...p.avisadas].map(clave))
  const desde = p.ahora.getTime()
  const hasta = desde + MINUTOS_DE_ANTICIPACION * 60_000
  const hoy = fechaISOEn(p.ahora)
  const resultado: ComidaPorAvisar[] = []

  // El cierre cae hoy o mañana; con dia_relativo = -1 puede ser la comida de pasado mañana.
  for (let dias = 0; dias <= 2; dias++) {
    const fecha = sumarDias(hoy, dias)
    for (const comida of TIEMPOS_COMIDA) {
      if (excluidas.has(clave({ fecha, comida }))) continue
      const cierre = cierreDe(fecha, comida, p.horas)
      if (cierre.getTime() > desde && cierre.getTime() <= hasta) resultado.push({ fecha, comida, cierre })
    }
  }

  return resultado.sort((a, b) => a.cierre.getTime() - b.cierre.getTime())
}
