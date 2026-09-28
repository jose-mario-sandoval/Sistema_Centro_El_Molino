import { fechaCorta, nombreDia } from '@/lib/comidas/semana'
import { fechaISOEn, instanteEnZona, sumarDias, type FechaISO } from '@/lib/fechas'
import type { DatosFijado, Publicacion } from '@/lib/mensajes/feed'
import { fechaHoraLocal } from '@/lib/mensajes/tiempo'
import type { Rol } from '@/lib/perfiles/roles'

/** Por cuánto tiempo se fija una publicación. 'fecha' = hasta el final del día elegido. */
export const DURACIONES_FIJADO = ['siempre', '1d', '3d', '7d', 'fecha'] as const
export type DuracionFijado = (typeof DURACIONES_FIJADO)[number]

export const ETIQUETA_DURACION: Record<DuracionFijado, string> = {
  siempre: 'Hasta que lo quite',
  '1d': 'Por 1 día',
  '3d': 'Por 3 días',
  '7d': 'Por 1 semana',
  fecha: 'Hasta el día…',
}

const DIA_MS = 24 * 60 * 60 * 1000
// El Salvador no tiene horario de verano: un día son siempre 24 horas.
const DIAS: Record<Exclude<DuracionFijado, 'siempre' | 'fecha'>, number> = { '1d': 1, '3d': 3, '7d': 7 }

/** Espejo de fijar_mensaje()/desfijar_mensaje() en SQL: quién fija y quita publicaciones. */
export function puedeFijar(rol: Rol): boolean {
  return rol === 'director' || rol === 'administracion'
}

/**
 * Fin de lo fijado, o null si es "hasta que lo quite". "Hasta el día X" dura todo ese día: termina a la
 * medianoche en que empieza el siguiente, en la hora de la casa. Se calcula en el servidor.
 */
export function fijadoHasta(duracion: DuracionFijado, ahora: Date, fecha?: FechaISO): Date | null {
  if (duracion === 'siempre') return null
  if (duracion === 'fecha') {
    if (!fecha) throw new Error('"Hasta el día" necesita una fecha')
    return instanteEnZona(sumarDias(fecha, 1), '00:00')
  }
  return new Date(ahora.getTime() + DIAS[duracion] * DIA_MS)
}

/** Fijada y todavía vigente. El vencimiento lo resuelve también la consulta; esto cubre la página abierta. */
export function estaFijada(p: DatosFijado, ahora: Date): boolean {
  return p.fijadoEn !== null && (p.fijadoHasta === null || Date.parse(p.fijadoHasta) > ahora.getTime())
}

/** Última fijada primero; a igual instante, id mayor primero (como el feed). */
function compararFijadas(a: Publicacion, b: Publicacion): number {
  return Date.parse(b.fijadoEn!) - Date.parse(a.fijadoEn!) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
}

/** Las fijadas vigentes van solo en "Fijados", arriba; el resto sigue en su orden por fecha. */
export function separarFijadas(
  feed: readonly Publicacion[],
  ahora: Date,
): { fijadas: Publicacion[]; resto: Publicacion[] } {
  const fijadas: Publicacion[] = []
  const resto: Publicacion[] = []
  for (const p of feed) (estaFijada(p, ahora) ? fijadas : resto).push(p)
  return { fijadas: fijadas.sort(compararFijadas), resto }
}

const POR_ROL: Partial<Record<Rol, string>> = { director: 'por el Director', administracion: 'por Administración' }

/**
 * 'Fijado por el Director hasta que lo quiten' · 'Fijado por Administración hasta el jueves 1/10' (todo ese
 * día) · '… hasta el jueves 1/10 a las 14:05'. Quién la fijó va por rol, nunca por nombre: Administración
 * no conoce nombres. Sin Intl dependiente del idioma: igual en el servidor y en el navegador.
 */
export function textoFijado(fijadoHasta: string | null, rolFijador: Rol | null | undefined): string {
  const por = rolFijador ? POR_ROL[rolFijador] : undefined
  let hasta = 'hasta que lo quiten'
  if (fijadoHasta !== null) {
    const fin = new Date(fijadoHasta)
    const hora = fechaHoraLocal(fin).slice(-5)
    const esFinDeDia = hora === '00:00'
    // A medianoche termina el día anterior: "hasta el jueves" y no "hasta el viernes a las 00:00".
    const dia = esFinDeDia ? sumarDias(fechaISOEn(fin), -1) : fechaISOEn(fin)
    hasta = `hasta el ${nombreDia(dia).toLowerCase()} ${fechaCorta(dia)}${esFinDeDia ? '' : ` a las ${hora}`}`
  }
  return ['Fijado', por, hasta].filter(Boolean).join(' ')
}
