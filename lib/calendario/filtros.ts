/**
 * Filtros del calendario (Director y Residente): qué tipos de evento se ven, si se marcan las propias
 * ausencias y si se ven solo los eventos que piden algo a la cocina. Se guarda en el dispositivo
 * (localStorage) como la lista de lo que está oculto: por defecto no se oculta nada, y un tipo nuevo
 * aparece solo. Administración no tiene filtros: sus eventos no traen tipo y nunca se filtran.
 */
import { ETIQUETA_TIPO, TIPOS_EVENTO, tienePedido, type Evento, type TipoEvento } from '@/lib/calendario/tipos'

/** Lo que se puede ocultar: los cuatro tipos, las marcas de ausencia y los eventos sin pedido a cocina. */
export type Filtro = TipoEvento | 'ausencias' | 'sin_pedido'

/** En el orden de los chips. También es el orden en que se guarda y se nombra. */
export const FILTROS: readonly Filtro[] = [...TIPOS_EVENTO, 'ausencias', 'sin_pedido']

export const CLAVE_FILTROS = 'molino-calendario'

/** Cómo se nombra cada filtro oculto en el aviso ("Estás ocultando: …"). */
const NOMBRE_OCULTO: Record<Filtro, string> = {
  ...ETIQUETA_TIPO,
  ausencias: 'Mis ausencias',
  sin_pedido: 'los eventos sin pedido a cocina',
}

/** Sin repetidos y en el orden de FILTROS: así dos listas iguales siempre se guardan igual. */
function ordenar(ocultos: Iterable<unknown>): Filtro[] {
  const conjunto = new Set(ocultos)
  return FILTROS.filter((f) => conjunto.has(f))
}

/** Lo guardado en el dispositivo. Lo roto, de otra versión o desconocido se descarta: mejor mostrar de más. */
export function leerOcultos(texto: string | null): Filtro[] {
  let datos: unknown
  try {
    datos = texto ? JSON.parse(texto) : null
  } catch {
    return []
  }
  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) return []
  const ocultos = (datos as { ocultos?: unknown }).ocultos
  return Array.isArray(ocultos) ? ordenar(ocultos) : []
}

export function escribirOcultos(ocultos: readonly Filtro[]): string {
  return JSON.stringify({ ocultos: ordenar(ocultos) })
}

/** Tocar un chip: lo oculto vuelve a verse, y lo visible se oculta. */
export function alternarFiltro(ocultos: readonly Filtro[], filtro: Filtro): Filtro[] {
  return ocultos.includes(filtro) ? ocultos.filter((f) => f !== filtro) : ordenar([...ocultos, filtro])
}

/**
 * Se ve si su tipo no está oculto y, con "Solo eventos con pedido a cocina", si pide algo. Un evento
 * sin tipo (el de Administración) nunca se filtra.
 */
export function eventoVisible(evento: Evento, ocultos: readonly Filtro[]): boolean {
  if (evento.tipo === null) return true
  if (ocultos.includes(evento.tipo)) return false
  return !ocultos.includes('sin_pedido') || tienePedido(evento)
}

/** Los eventos que se ven, en su orden, y cuántos quedaron ocultos. */
export function filtrarEventos(eventos: Evento[], ocultos: readonly Filtro[]): { visibles: Evento[]; ocultos: number } {
  if (ocultos.length === 0) return { visibles: eventos, ocultos: 0 }
  const visibles = eventos.filter((e) => eventoVisible(e, ocultos))
  return { visibles, ocultos: eventos.length - visibles.length }
}

/** 'A' · 'A y B' · 'A, B y C' */
function enumerar(nombres: string[]): string {
  if (nombres.length <= 1) return nombres.join('')
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

/** El aviso arriba del calendario, o null si no hay nada oculto. */
export function textoOcultos(ocultos: readonly Filtro[]): string | null {
  if (ocultos.length === 0) return null
  return `Estás ocultando: ${enumerar(ordenar(ocultos).map((f) => NOMBRE_OCULTO[f]))}.`
}

/** '1 evento oculto por los filtros' · '3 eventos ocultos por los filtros' */
export function textoCantidadOcultos(cantidad: number): string {
  return cantidad === 1 ? '1 evento oculto por los filtros' : `${cantidad} eventos ocultos por los filtros`
}

/**
 * Nombre accesible de un día de la cuadrícula: cuántos eventos y de qué tipo (los puntos del teléfono
 * no tienen texto), cuántos ocultan los filtros (para que el día no parezca vacío) y la ausencia.
 * Administración: cuántos pedidos para la cocina, sin tipos.
 */
export function etiquetaDiaCalendario({
  etiqueta,
  visibles,
  ocultos,
  paraCocina,
  ausente,
}: {
  etiqueta: string
  visibles: Evento[]
  ocultos: number
  paraCocina: boolean
  ausente: boolean
}): string {
  const partes = [etiqueta]
  const cantidad = visibles.length
  if (paraCocina) {
    if (cantidad > 0) partes.push(`${cantidad} ${cantidad === 1 ? 'pedido' : 'pedidos'} para la cocina`)
  } else if (cantidad > 0) {
    const tipos = [...new Set(visibles.flatMap((e) => (e.tipo ? [ETIQUETA_TIPO[e.tipo]] : [])))]
    const deQue = tipos.length ? `: ${enumerar(tipos)}` : ''
    partes.push(`${cantidad} ${cantidad === 1 ? 'evento' : 'eventos'}${deQue}`)
  }
  if (ocultos > 0) partes.push(`${ocultos} ${ocultos === 1 ? 'oculto' : 'ocultos'} por los filtros`)
  if (ausente) partes.push('ausente')
  return partes.join(', ')
}

/** Lo que va en html[data-cal-oculta] (ver SCRIPT_FILTROS_CALENDARIO), o null si no hay nada oculto. */
export function atributoOcultos(ocultos: readonly Filtro[]): string | null {
  return ocultos.length ? ordenar(ocultos).join(' ') : null
}

/**
 * Se ejecuta en <head> antes de pintar: copia lo oculto a html[data-cal-oculta] para que, al recargar
 * /calendario, el CSS esconda esos eventos mientras React no hidrató (globals.css, "antes de
 * hidratar"). Sin eso, lo oculto aparecería un instante y la página saltaría al esconderlo.
 *
 * Va en todas las páginas, también en las de Administración: por eso no nombra ninguna clave (ni
 * categorías ni ausencias). Copia solo palabras simples de lo guardado; el CSS reconoce las suyas y
 * las demás no hacen nada. Una prueba unitaria verifica que coincida con leerOcultos.
 */
export const SCRIPT_FILTROS_CALENDARIO = `(function(){try{
var g=JSON.parse(localStorage.getItem(${JSON.stringify(CLAVE_FILTROS)})||'null'),o=g&&g.ocultos,t=[],i;
if(Object.prototype.toString.call(o)!=='[object Array]')return;
for(i=0;i<o.length;i++)if(typeof o[i]==='string'&&/^[a-z_]{1,24}$/.test(o[i])&&t.indexOf(o[i])<0)t.push(o[i]);
if(t.length)document.documentElement.setAttribute('data-cal-oculta',t.join(' '));
}catch(e){}})();`
