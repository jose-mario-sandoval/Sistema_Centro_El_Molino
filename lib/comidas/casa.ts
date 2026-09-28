import { sumarDias, type FechaISO } from '@/lib/fechas'
import { partesParaCocina, totalQueComen, type ResumenComida } from './resumen'
import { diasDeSemana, etiquetaDia, tituloComida } from './semana'
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

/**
 * El texto bajo "Comidas": lo propio para Director y Residente en su Plan y su Semana; la casa entera
 * para el Director en La casa (y en la página de una persona); solo lectura para Administración.
 */
export function descripcionComidas(rol: 'director' | 'residente' | 'administracion', ruta: string): string {
  if (rol === 'administracion') return 'Planes y selecciones de comida de la casa, en solo lectura.'
  if (rol === 'director' && ruta.startsWith('/comidas/casa'))
    return 'Las comidas de toda la casa: quién come cada día, la comida de cada persona y los extras para la cocina.'
  return 'Tu plan habitual y lo que vas a comer cada día de la semana.'
}

export type VistaPersona = 'semana' | 'plan' | 'ausencias'

/**
 * Las vistas de una persona en La casa (`?ver=`). Con "Su"/"Sus" y no "Semana"/"Plan de comida":
 * así no se confunden con las pestañas de arriba, que son las del propio Director.
 */
export function pestanasPersona(voz: 'propia' | 'ajena'): { clave: VistaPersona; etiqueta: string }[] {
  const [su, sus] = voz === 'propia' ? ['Mi', 'Mis'] : ['Su', 'Sus']
  return [
    { clave: 'semana', etiqueta: `${su} semana` },
    { clave: 'plan', etiqueta: `${su} plan` },
    { clave: 'ausencias', etiqueta: `${sus} ausencias` },
  ]
}

const ARTICULO: Record<TiempoComida, 'el' | 'la'> = { desayuno: 'el', almuerzo: 'el', cena: 'la' }
const TU: Record<TiempoComida, string> = { desayuno: 'Tu desayuno', almuerzo: 'Tu almuerzo', cena: 'Tu cena' }

/** 'el almuerzo del miércoles 23/9' */
function laComidaDel(comida: TiempoComida, nombreDia: string, fechaCorta: string): string {
  return `${ARTICULO[comida]} ${ETIQUETA_TIEMPO[comida].toLowerCase()} del ${nombreDia.toLowerCase()} ${fechaCorta}`
}

/**
 * El título de la burbuja de una persona en "quiénes comen": de quién es, qué comida y qué día.
 * 'Almuerzo de Juan, miércoles 23/9' · el Director mirándose a sí mismo (`persona` null): 'Tu almuerzo
 * del miércoles 23/9'.
 */
export function tituloComidaDePersona(
  comida: TiempoComida,
  nombreDia: string,
  fechaCorta: string,
  persona: string | null,
): string {
  if (persona === null) return `${TU[comida]} del ${nombreDia.toLowerCase()} ${fechaCorta}`
  return `${ETIQUETA_TIEMPO[comida]} de ${persona}, ${nombreDia.toLowerCase()} ${fechaCorta}`
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
  cerrada = false,
  /** Las notas de los extras que se ven en la celda ('3 extra: Sin sal'). */
  notas: readonly string[] = [],
): string {
  const comen = totalQueComen(resumen)
  const partes = [`${comen} ${comen === 1 ? 'come' : 'comen'}`]
  const desglose = partesParaCocina(resumen).map((parte) => parte.texto)
  if (desglose.length > 0) partes.push(desglose.join(', '))
  if (extra) partes.push(`+${extra} extra`)
  partes.push(...notas)
  if (cerrada) partes.push('Cerrada')
  return `${tituloComida(comida, nombreDia, fechaCorta)}: ${partes.join('. ')}. Ver quiénes`
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

/** '1 persona' · '3 personas' */
export function textoCantidadExtra(cantidad: number): string {
  return `${cantidad} ${cantidad === 1 ? 'persona' : 'personas'}`
}

/** 'Miércoles 23/9 · Cena · 3 personas' */
export function textoExtra(extra: ExtraManual): string {
  return `${etiquetaDia(extra.fecha)} · ${ETIQUETA_TIEMPO[extra.comida]} · ${textoCantidadExtra(extra.cantidad)}`
}

/** Nombre accesible del "+ Extra" de una celda: 'Agregar extra al almuerzo del miércoles 30/9'. */
export function etiquetaAgregarExtra(comida: TiempoComida, nombreDia: string, fechaCorta: string): string {
  const laComida = laComidaDel(comida, nombreDia, fechaCorta)
  return `Agregar extra ${laComida.startsWith('el ') ? `al ${laComida.slice(3)}` : `a ${laComida}`}`
}

/** 'Extras para el almuerzo del miércoles 30/9': el título de la burbuja del "+ Extra". */
export function tituloExtras(comida: TiempoComida, nombreDia: string, fechaCorta: string): string {
  return `Extras para ${laComidaDel(comida, nombreDia, fechaCorta)}`
}

/** Los extras manuales de una comida (su burbuja los lista, con "Quitar" mientras no cerró). */
export function extrasDeComida(extras: readonly ExtraManual[], fecha: FechaISO, comida: TiempoComida): ExtraManual[] {
  return extras.filter((extra) => extra.fecha === fecha && extra.comida === comida)
}

/**
 * Hay algo escrito en el formulario del extra que todavía no se agregó (la cantidad no es la de
 * partida o hay una nota): cerrar la burbuja pregunta "¿Agregar o descartar?" en lugar de perderlo.
 */
export function extraSinGuardar(formulario: { cantidad: string; nota: string }): boolean {
  return formulario.cantidad.trim() !== '1' || formulario.nota.trim() !== ''
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
