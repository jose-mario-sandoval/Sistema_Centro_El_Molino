import { DIAS_MAXIMOS_AUSENCIA } from '@/lib/ausencias/tipos'
import { cuadriculaMes, mesAnterior, mesDe, mesSiguiente, type MesISO } from '@/lib/calendario/cuadricula'
import { lunesDe, sumarDias, type FechaISO } from '@/lib/fechas'
import { rangoLegible } from '@/lib/fechas/rango'

/**
 * Elegir un rango de días tocando el primero y el último (mini calendario de ausencias).
 * Todo puro: el componente solo pinta y reenvía toques y teclas.
 */

/** `hasta` nulo con `desde` elegido = por ahora, un solo día. */
export type SeleccionRango = { desde: FechaISO | null; hasta: FechaISO | null }

export const SIN_SELECCION: SeleccionRango = { desde: null, hasta: null }

/**
 * Primer toque = primer día. Segundo toque = último día (el mismo día vale: es un solo día); si es
 * anterior al primero, vuelve a empezar desde ahí. Con el rango completo, un toque vuelve a empezar.
 */
export function tocarDia(seleccion: SeleccionRango, fecha: FechaISO): SeleccionRango {
  const { desde, hasta } = seleccion
  if (desde !== null && hasta === null && fecha >= desde) return { desde, hasta: fecha }
  return { desde: fecha, hasta: null }
}

/** ¿El día cae dentro de lo elegido? Las fechas ISO se comparan como texto. */
export function enSeleccion(seleccion: SeleccionRango, fecha: FechaISO): boolean {
  const { desde } = seleccion
  if (desde === null) return false
  return desde <= fecha && fecha <= (seleccion.hasta ?? desde)
}

/** Primer o último día de lo elegido, para dibujarlos más marcados que los del medio. */
export function extremoDeSeleccion(seleccion: SeleccionRango, fecha: FechaISO): 'desde' | 'hasta' | null {
  if (fecha === seleccion.desde) return 'desde'
  if (fecha === seleccion.hasta) return 'hasta'
  return null
}

/**
 * Días que se pueden marcar como ausencia: de hoy (lo que ya pasó no se registra) a un año. Como el
 * primer día nunca es anterior a hoy, ningún rango elegido supera el máximo que exige la base.
 */
export function limitesAusencia(hoy: FechaISO): { min: FechaISO; max: FechaISO } {
  return { min: hoy, max: sumarDias(hoy, DIAS_MAXIMOS_AUSENCIA) }
}

function ultimoDiaDelMes(mes: MesISO): FechaISO {
  return sumarDias(`${mesSiguiente(mes)}-01`, -1)
}

/** Mismo número de día en otro mes; si no existe (31 de febrero), el último día de ese mes. */
function mismoDiaEnMes(fecha: FechaISO, mes: MesISO): FechaISO {
  const candidato = `${mes}-${fecha.slice(8, 10)}`
  const ultimo = ultimoDiaDelMes(mes)
  return candidato > ultimo ? ultimo : candidato
}

function recortar(fecha: FechaISO, min: FechaISO, max: FechaISO): FechaISO {
  if (fecha < min) return min
  if (fecha > max) return max
  return fecha
}

/**
 * Teclado del patrón de selector de fecha (APG): flechas = ±1 día / ±1 semana, Inicio/Fin = lunes y
 * domingo de la semana, RePág/AvPág = mes anterior/siguiente. Nunca sale de [min, max]. Otra tecla: null.
 */
export function moverFoco(fecha: FechaISO, tecla: string, min: FechaISO, max: FechaISO): FechaISO | null {
  let destino: FechaISO
  switch (tecla) {
    case 'ArrowLeft':
      destino = sumarDias(fecha, -1)
      break
    case 'ArrowRight':
      destino = sumarDias(fecha, 1)
      break
    case 'ArrowUp':
      destino = sumarDias(fecha, -7)
      break
    case 'ArrowDown':
      destino = sumarDias(fecha, 7)
      break
    case 'Home':
      destino = lunesDe(fecha)
      break
    case 'End':
      destino = sumarDias(lunesDe(fecha), 6)
      break
    case 'PageUp':
      destino = mismoDiaEnMes(fecha, mesAnterior(mesDe(fecha)))
      break
    case 'PageDown':
      destino = mismoDiaEnMes(fecha, mesSiguiente(mesDe(fecha)))
      break
    default:
      return null
  }
  return recortar(destino, min, max)
}

/** Semanas (lunes a domingo) que tienen algún día del mes; los días de otros meses quedan en null. */
export function semanasDelMes(mes: MesISO): (FechaISO | null)[][] {
  const dias = cuadriculaMes(mes)
  const semanas: (FechaISO | null)[][] = []
  for (let i = 0; i < dias.length; i += 7) {
    const semana = dias.slice(i, i + 7).map((d) => (d.enMes ? d.fecha : null))
    if (semana.some((f) => f !== null)) semanas.push(semana)
  }
  return semanas
}

/**
 * El único día del mes que recibe el foco con Tab: el primero elegido, si no hoy, si no el primer día
 * que se puede elegir. Null si el mes entero queda fuera de los límites.
 */
export function focoInicial(
  mes: MesISO,
  { seleccion, hoy, min, max }: { seleccion: SeleccionRango; hoy: FechaISO; min: FechaISO; max: FechaISO },
): FechaISO | null {
  const elegible = (f: FechaISO | null): f is FechaISO => f !== null && mesDe(f) === mes && min <= f && f <= max
  if (elegible(seleccion.desde)) return seleccion.desde
  if (elegible(hoy)) return hoy
  const primero = recortar(`${mes}-01`, min, max)
  return elegible(primero) ? primero : null
}

/** ¿Se puede ir al mes anterior o al siguiente sin salir de los límites? */
export function puedeIrAlMes(mes: MesISO, min: FechaISO, max: FechaISO): { anterior: boolean; siguiente: boolean } {
  return { anterior: mes > mesDe(min), siguiente: mes < mesDe(max) }
}

function diasEntre(desde: FechaISO, hasta: FechaISO): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1
}

/**
 * Lo elegido, escrito, para leerlo antes de guardar (y para el lector de pantalla). La cantidad de
 * días desambigua un rango que cruza de año, que rangoLegible escribe sin año.
 */
export function resumenSeleccion(seleccion: SeleccionRango): string {
  const { desde, hasta } = seleccion
  if (desde === null) return 'Todavía no elegiste ningún día.'
  if (hasta === null) return `El ${rangoLegible(desde, desde)}: un solo día. Si son más días, tocá el último.`
  if (hasta === desde) return `El ${rangoLegible(desde, desde)}: un solo día.`
  return `Del ${rangoLegible(desde, hasta)} (${diasEntre(desde, hasta)} días).`
}

/** El mismo tope que zod y la base: hasta ≤ desde + DIAS_MAXIMOS_AUSENCIA. */
export function errorSeleccion(seleccion: SeleccionRango): string | null {
  const { desde, hasta } = seleccion
  if (desde === null || hasta === null) return null
  return hasta > sumarDias(desde, DIAS_MAXIMOS_AUSENCIA) ? 'Una ausencia puede durar hasta un año.' : null
}
