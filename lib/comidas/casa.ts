import { sumarDias, type FechaISO } from '@/lib/fechas'
import { partesParaCocina, totalQueComen, type ResumenComida } from './resumen'
import { diasDeSemana, etiquetaDia } from './semana'
import { CANTIDAD_MAXIMA_EXTRA, ETIQUETA_TIEMPO, type ExtraManual, type TiempoComida } from './tipos'

/*
 * Textos y cálculos de "La casa" del Director (/comidas/casa). Puros: se prueban sin navegador.
 */

/** Las pestañas de Comidas. "La casa" solo para el Director. */
export function pestanasComidas(esDirector: boolean): { ruta: string; etiqueta: string }[] {
  const pestanas = [
    { ruta: '/comidas/plan', etiqueta: 'Plan de comida' },
    { ruta: '/comidas/semana', etiqueta: 'Semana' },
  ]
  return esDirector ? [...pestanas, { ruta: '/comidas/casa', etiqueta: 'La casa' }] : pestanas
}

/** 'Almuerzo del miércoles 23/9' (`nombreDia`: 'Miércoles'). */
export function tituloComidaCasa(comida: TiempoComida, nombreDia: string, fechaCorta: string): string {
  return `${ETIQUETA_TIEMPO[comida]} del ${nombreDia.toLowerCase()} ${fechaCorta}`
}

/**
 * Nombre accesible del botón de una celda de la tabla de la casa: todo lo que se ve escrito en la
 * celda, en el orden de la cocina, y qué hace tocarla.
 * 'Almuerzo del miércoles 23/9: 2 comen. 1 temprano (07:30), 1 sí, 1 sin definir. +3 extra. Ver quiénes'
 */
export function etiquetaCeldaCasa(
  comida: TiempoComida,
  nombreDia: string,
  fechaCorta: string,
  resumen: ResumenComida,
  extra?: number,
): string {
  const comen = totalQueComen(resumen)
  const partes = [`${comen} ${comen === 1 ? 'come' : 'comen'}`]
  const desglose = partesParaCocina(resumen).map((parte) => parte.texto)
  if (desglose.length > 0) partes.push(desglose.join(', '))
  if (extra) partes.push(`+${extra} extra`)
  return `${tituloComidaCasa(comida, nombreDia, fechaCorta)}: ${partes.join('. ')}. Ver quiénes`
}

/** 'Sin definir (2)' */
export function etiquetaGrupo(etiqueta: string, cantidad: number): string {
  return `${etiqueta} (${cantidad})`
}

/**
 * Días de la semana en que se puede agregar un extra: desde hoy (la base lo exige igual). En la
 * semana en curso, de hoy al domingo; en la siguiente, los siete; en una pasada, ninguno.
 */
export function diasParaExtra(lunes: FechaISO, hoy: FechaISO): FechaISO[] {
  if (sumarDias(lunes, 6) < hoy) return []
  return diasDeSemana(lunes).filter((fecha) => fecha >= hoy)
}

/** Los botones − y + de la cantidad de un extra: de a uno, entre 1 y 50 (el check de la base). */
export function ajustarCantidad(actual: number, delta: 1 | -1): number {
  const base = Number.isInteger(actual) ? actual : 1
  return Math.min(CANTIDAD_MAXIMA_EXTRA, Math.max(1, base + delta))
}

/** 'Miércoles 23/9 · Cena · 3 personas' */
export function textoExtra(extra: ExtraManual): string {
  const personas = `${extra.cantidad} ${extra.cantidad === 1 ? 'persona' : 'personas'}`
  return `${etiquetaDia(extra.fecha)} · ${ETIQUETA_TIEMPO[extra.comida]} · ${personas}`
}

/**
 * Las notas de los extras manuales para la celda de la cocina ("+N extra" y debajo cada nota con su
 * cantidad). Nunca quién lo agregó: `ExtraManual` ni siquiera lo trae. Los extras sin nota ya están en
 * el total y no agregan líneas.
 */
export function notasPorComida(extras: readonly ExtraManual[]): Record<FechaISO, Partial<Record<TiempoComida, string[]>>> {
  const notas: Record<FechaISO, Partial<Record<TiempoComida, string[]>>> = {}
  for (const extra of extras) {
    if (!extra.nota) continue
    const porDia = (notas[extra.fecha] ??= {})
    ;(porDia[extra.comida] ??= []).push(`${extra.cantidad} extra: ${extra.nota}`)
  }
  return notas
}
