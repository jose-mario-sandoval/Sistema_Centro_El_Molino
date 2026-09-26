import { lunesDe, sumarDias, type FechaISO } from '@/lib/fechas'
import { etiquetaDiaLarga, etiquetaMesLarga } from '@/lib/fechas/etiquetas'

/** Mes de calendario 'YYYY-MM'. */
export type MesISO = string

export type DiaCuadricula = {
  fecha: FechaISO
  /** Número del día dentro de su mes (1–31). */
  dia: number
  /** false para los días del mes anterior o siguiente que completan la cuadrícula. */
  enMes: boolean
}

/** Día con su etiqueta legible (lib/fechas/etiquetas.ts). */
export type DiaConEtiqueta = DiaCuadricula & { etiqueta: string }

/** 6 semanas × 7 días: alcanza para cualquier mes. */
export const DIAS_CUADRICULA = 42

export const DIAS_SEMANA_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const

/** Rango de fechas de eventos: el mismo que exigen zod (lib/validacion/calendario.ts) y el check de la base. */
export const FECHA_MINIMA: FechaISO = '2000-01-01'
export const FECHA_MAXIMA: FechaISO = '2099-12-31'

const PATRON_MES = /^20\d{2}-(0[1-9]|1[0-2])$/

/** Valida el parámetro ?mes= (años 2000–2099). */
export function esMesISO(valor: unknown): valor is MesISO {
  return typeof valor === 'string' && PATRON_MES.test(valor)
}

export function mesDe(fecha: FechaISO): MesISO {
  return fecha.slice(0, 7)
}

function desplazarMes(mes: MesISO, delta: number): MesISO {
  const [anio, numero] = mes.split('-').map(Number)
  const indice = anio * 12 + (numero - 1) + delta
  const nuevoAnio = Math.floor(indice / 12)
  const nuevoMes = indice - nuevoAnio * 12 + 1
  return `${nuevoAnio}-${String(nuevoMes).padStart(2, '0')}`
}

export function mesAnterior(mes: MesISO): MesISO {
  return desplazarMes(mes, -1)
}

export function mesSiguiente(mes: MesISO): MesISO {
  return desplazarMes(mes, 1)
}

/** Primer (lunes) y último (domingo) día de la cuadrícula del mes. */
export function rangoCuadricula(mes: MesISO): { desde: FechaISO; hasta: FechaISO } {
  const desde = lunesDe(`${mes}-01`)
  return { desde, hasta: sumarDias(desde, DIAS_CUADRICULA - 1) }
}

/** 42 días consecutivos desde el lunes de la semana del día 1. */
export function cuadriculaMes(mes: MesISO): DiaCuadricula[] {
  const { desde } = rangoCuadricula(mes)
  return Array.from({ length: DIAS_CUADRICULA }, (_, i) => {
    const fecha = sumarDias(desde, i)
    return { fecha, dia: Number(fecha.slice(8, 10)), enMes: mesDe(fecha) === mes }
  })
}

/** 'Septiembre de 2026'. Sin Intl: lib/fechas/etiquetas.ts dice lo mismo en el servidor y en el navegador. */
export function etiquetaMes(mes: MesISO): string {
  return etiquetaMesLarga(mes)
}

/** 'Miércoles, 16 de septiembre de 2026'. Con año: la cuadrícula incluye días de meses (y años) vecinos. */
export function etiquetaDia(fecha: FechaISO): string {
  return etiquetaDiaLarga(fecha)
}

/** Agrupa por fecha conservando el orden de entrada. */
export function agruparPorFecha<T extends { fecha: FechaISO }>(elementos: T[]): Record<FechaISO, T[]> {
  const grupos: Record<FechaISO, T[]> = {}
  for (const elemento of elementos) {
    grupos[elemento.fecha] ??= []
    grupos[elemento.fecha].push(elemento)
  }
  return grupos
}
