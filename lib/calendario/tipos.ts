import type { CSSProperties } from 'react'
import type { FechaISO } from '@/lib/fechas'
import type { Enum } from '@/lib/supabase/tipos'

export type TipoEvento = Enum<'tipo_evento'>
export type RequerimientoCocina = Enum<'requerimiento_cocina'>

export const TIPOS_EVENTO: readonly TipoEvento[] = ['san_rafael', 'san_gabriel', 'san_miguel', 'otro']

export const ETIQUETA_TIPO: Record<TipoEvento, string> = {
  san_rafael: 'San Rafael',
  san_gabriel: 'San Gabriel',
  san_miguel: 'San Miguel',
  otro: 'Otro',
}

/**
 * La sigla que acompaña siempre al color del tipo (DESIGN.md §2.4): el color nunca va solo, y con
 * daltonismo el rojo de San Miguel y el verde de San Rafael se parecen; "SM" y "SR", no.
 */
export const MARCA_TIPO: Record<TipoEvento, string> = {
  san_rafael: 'SR',
  san_gabriel: 'SG',
  san_miguel: 'SM',
  otro: 'Otro',
}

/**
 * Lo que queda de la marca donde la sigla no entra: en la cuadrícula del mes en un teléfono angosto o
 * con letra grande (la letra nunca baja de --t-xs, DESIGN.md §4). "Otro" es un punto gris sin letra.
 */
export const INICIAL_TIPO: Record<TipoEvento, string> = {
  san_rafael: 'R',
  san_gabriel: 'G',
  san_miguel: 'M',
  otro: '',
}

/**
 * Colores del tipo como variables --ev / --ev-bg, que globals.css usa para el tinte, el texto, el
 * borde y la marca. Los tokens --ev-<tipo> y --ev-<tipo>-bg se nombran por interpolación: no
 * renombrarlos.
 */
export function varsTipo(tipo: TipoEvento): CSSProperties {
  const token = `--ev-${tipo.replace('_', '-')}`
  return { '--ev': `var(${token})`, '--ev-bg': `var(${token}-bg)` } as CSSProperties
}

/**
 * ¿Le pide algo a la cocina? La misma regla que `eventos_para_cocina()`: algo de la lista fija o un
 * pedido libre (la base nunca guarda un texto en blanco).
 */
export function tienePedido(evento: Pick<Evento, 'requiere_cocina' | 'requiere_otro_texto'>): boolean {
  return evento.requiere_cocina.length > 0 || evento.requiere_otro_texto !== null
}

/** Lo que un evento puede pedirle a la cocina. */
export const REQUERIMIENTOS_COCINA: readonly RequerimientoCocina[] = ['merienda', 'comida', 'materiales']

export const ETIQUETA_REQUERIMIENTO: Record<RequerimientoCocina, string> = {
  merienda: 'Merienda',
  comida: 'Comida',
  materiales: 'Utensilios y materiales',
}

/** Ayuda breve de cada pedido, para quien crea el evento. */
export const AYUDA_REQUERIMIENTO: Record<RequerimientoCocina, string> = {
  merienda: 'Café, bebidas y algo para picar.',
  comida: 'Almuerzo o cena preparados para el evento.',
  materiales: 'Vajilla, mesas, termos: sin preparar comida. No se combina con lo demás.',
}

/**
 * Lo que muestran la cuadrícula y el modal del día.
 *
 * Administración no conoce de qué son los eventos (lib/calendario/consultas.ts): a ella `titulo` le
 * llega como el resumen de lo que debe preparar; sí recibe `tipo`. Nunca hay un título real en un
 * evento de Administración. `tipo` es null solo en un formulario donde todavía no se eligió.
 */
export type Evento = {
  id: string
  titulo: string
  fecha: FechaISO
  hora: string | null
  tipo: TipoEvento | null
  requiere_cocina: RequerimientoCocina[]
  requiere_otro_texto: string | null
  serie_id: string | null
}

/** Lo único que Administración ve de un evento: cuándo, de qué categoría y qué preparar (`eventos_para_cocina`). */
export type EventoParaCocina = {
  id: string
  fecha: FechaISO
  hora: string | null
  tipo: TipoEvento
  requiere_cocina: RequerimientoCocina[]
  requiere_otro_texto: string | null
}

/**
 * Nuevo estado de las casillas al tocar una. "Solo materiales" va solo (regla de la base y de
 * lib/validacion/calendario.ts): marcarlo desmarca lo demás, y marcar lo demás lo desmarca.
 */
export function alternarRequerimiento(
  actuales: readonly RequerimientoCocina[],
  tocado: RequerimientoCocina,
): RequerimientoCocina[] {
  if (actuales.includes(tocado)) return actuales.filter((r) => r !== tocado)
  if (tocado === 'materiales') return ['materiales']
  return [...actuales.filter((r) => r !== 'materiales'), tocado]
}

/** 'Merienda' · 'Merienda y comida' · 'Utensilios y materiales' */
export function textoRequerimientos(requerimientos: readonly RequerimientoCocina[]): string {
  const orden = REQUERIMIENTOS_COCINA.filter((r) => requerimientos.includes(r))
  if (orden.length === 0) return ''
  if (orden.length === 1) return ETIQUETA_REQUERIMIENTO[orden[0]]
  const nombres = orden.map((r) => ETIQUETA_REQUERIMIENTO[r].toLowerCase())
  return `${ETIQUETA_REQUERIMIENTO[orden[0]]} y ${nombres.slice(1).join(' y ')}`
}

/** Lista fija + lo pedido por texto libre: 'Merienda y comida · 20 sillas extra'. */
export function textoPedido(requerimientos: readonly RequerimientoCocina[], otroTexto: string | null): string {
  const fijo = textoRequerimientos(requerimientos)
  if (!otroTexto) return fijo
  return fijo ? `${fijo} · ${otroTexto}` : otroTexto
}

/** El evento tal como lo ve Administración: sin título, con su categoría y lo que debe preparar como texto. */
export function eventoParaAdministracion(e: EventoParaCocina): Evento {
  return {
    id: e.id,
    fecha: e.fecha,
    hora: e.hora,
    titulo: textoPedido(e.requiere_cocina, e.requiere_otro_texto),
    // `?? null`: si el código llega antes que la migración que agrega `tipo` a eventos_para_cocina(),
    // el calendario de Administración se ve sin categoría (como antes) en vez de romperse.
    tipo: e.tipo ?? null,
    requiere_cocina: e.requiere_cocina,
    requiere_otro_texto: e.requiere_otro_texto,
    serie_id: null,
  }
}
