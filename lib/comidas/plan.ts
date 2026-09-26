import { NOMBRES_DIA } from './semana'
import { ETIQUETA_TIEMPO, INFO_ESTADO, TIEMPOS_COMIDA, type TiempoComida, type ValorComida } from './tipos'
import type { PlanSemanal } from './vista'

/** Clave de una celda del plan (día de semana 1..7 + comida). */
export function claveCelda(dia: number, comida: TiempoComida): string {
  return `${dia}|${comida}`
}

/** El plan aplanado por clave de celda; lo que no está definido no aparece. */
export function celdasDesdePlan(plan: PlanSemanal): Record<string, ValorComida> {
  const celdas: Record<string, ValorComida> = {}
  for (let dia = 1; dia <= 7; dia++) {
    for (const comida of TIEMPOS_COMIDA) {
      const valor = plan[dia]?.[comida]
      if (valor) celdas[claveCelda(dia, comida)] = { estado: valor.estado, nota: valor.nota }
    }
  }
  return celdas
}

/** Si `nuevo` difiere de lo último pedido (o confirmado) para esa celda. null = sin definir. */
export function hayQueGuardar(pedido: ValorComida | null, nuevo: ValorComida | null): boolean {
  if (pedido === null || nuevo === null) return pedido !== nuevo
  return pedido.estado !== nuevo.estado || pedido.nota !== nuevo.nota
}

/**
 * Nombre accesible de una celda: 'Martes, almuerzo: Comer temprano 12:00. Cambiar'. Contiene el texto
 * visible de la celda (el corto está dentro de la etiqueta completa; "Falta" va escrito).
 */
export function etiquetaCelda(dia: number, comida: TiempoComida, valor: ValorComida | null): string {
  const cabeza = `${NOMBRES_DIA[dia - 1]}, ${ETIQUETA_TIEMPO[comida].toLowerCase()}`
  if (!valor) return `${cabeza}: Falta, sin definir. Cambiar`
  const { etiqueta, nota } = INFO_ESTADO[valor.estado]
  const detalle = valor.nota ? (nota === 'hora' ? ` ${valor.nota}` : `, ${valor.nota}`) : ''
  return `${cabeza}: ${etiqueta}${detalle}. Cambiar`
}
