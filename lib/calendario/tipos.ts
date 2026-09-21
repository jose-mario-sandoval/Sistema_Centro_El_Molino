import type { FechaISO } from '@/lib/fechas'
import type { Enum } from '@/lib/supabase/tipos'

export type TipoEvento = Enum<'tipo_evento'>
export type RequerimientoCocina = Enum<'requerimiento_cocina'>

export const TIPOS_EVENTO: readonly TipoEvento[] = ['retiro', 'charla', 'visita', 'reunion', 'otro']

export const ETIQUETA_TIPO: Record<TipoEvento, string> = {
  retiro: 'Retiro',
  charla: 'Charla o formación',
  visita: 'Visita',
  reunion: 'Reunión',
  otro: 'Otro',
}

/** Lo que un evento puede pedirle a la cocina. */
export const REQUERIMIENTOS_COCINA: readonly RequerimientoCocina[] = ['merienda', 'comida', 'materiales']

export const ETIQUETA_REQUERIMIENTO: Record<RequerimientoCocina, string> = {
  merienda: 'Merienda',
  comida: 'Comida',
  materiales: 'Solo materiales de cocina',
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
 * llega como el resumen de lo que debe preparar y `tipo` es null. Nunca hay un título real en un
 * evento de Administración.
 */
export type Evento = {
  id: string
  titulo: string
  fecha: FechaISO
  hora: string | null
  tipo: TipoEvento | null
  requiere_cocina: RequerimientoCocina[]
}

/** Lo único que Administración ve de un evento: cuándo y qué preparar (`eventos_para_cocina`). */
export type EventoParaCocina = {
  id: string
  fecha: FechaISO
  hora: string | null
  requiere_cocina: RequerimientoCocina[]
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

/** 'Merienda' · 'Merienda y comida' · 'Solo materiales de cocina' */
export function textoRequerimientos(requerimientos: readonly RequerimientoCocina[]): string {
  const orden = REQUERIMIENTOS_COCINA.filter((r) => requerimientos.includes(r))
  if (orden.length === 0) return ''
  if (orden.length === 1) return ETIQUETA_REQUERIMIENTO[orden[0]]
  const nombres = orden.map((r) => ETIQUETA_REQUERIMIENTO[r].toLowerCase())
  return `${ETIQUETA_REQUERIMIENTO[orden[0]]} y ${nombres.slice(1).join(' y ')}`
}

/** El evento tal como lo ve Administración: sin título ni tipo, con lo que debe preparar como texto. */
export function eventoParaAdministracion(e: EventoParaCocina): Evento {
  return {
    id: e.id,
    fecha: e.fecha,
    hora: e.hora,
    titulo: textoRequerimientos(e.requiere_cocina),
    tipo: null,
    requiere_cocina: e.requiere_cocina,
  }
}
