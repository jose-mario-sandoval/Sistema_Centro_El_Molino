import { fechaISOEn } from '@/lib/fechas'
import { MESES } from '@/lib/fechas/etiquetas'
import type { FilaPresupuesto, MesPension } from './tipos'

/** Dólares decimales → centavos exactos; nunca se multiplica un float monetario. */
export function centavosDesdeTexto(valor: string): number | null {
  const texto = valor.trim()
  if (!/^(0|[1-9]\d{0,6})(\.\d{1,2})?$/.test(texto)) return null
  const [entero, decimales = ''] = texto.split('.')
  const centavos = Number(entero) * 100 + Number(decimales.padEnd(2, '0'))
  return centavos >= 1 && centavos <= 100_000_000 ? centavos : null
}

export function dolares(centavos: number): string {
  return new Intl.NumberFormat('es-SV', { style: 'currency', currency: 'USD' }).format(centavos / 100)
}

export function mesActual(instante = new Date()): string {
  return fechaISOEn(instante).slice(0, 7) + '-01'
}

export function etiquetaPeriodo(periodo: string): string {
  return `${MESES[Number(periodo.slice(5, 7)) - 1]} de ${periodo.slice(0, 4)}`
}

export function resumenPresupuesto(filas: Pick<MesPension, 'monto_centavos' | 'pagado_centavos'>[]) {
  const meta = filas.reduce((total, fila) => total + (fila.monto_centavos ?? 0), 0)
  const pagado = filas.reduce((total, fila) => total + fila.pagado_centavos, 0)
  return { meta, pagado, falta: Math.max(0, meta - pagado), porcentaje: meta > 0 ? Math.min(100, pagado / meta * 100) : 0 }
}

export function seleccionPagable(meses: MesPension[], periodos: string[]) {
  const elegidos = meses.filter((m) => periodos.includes(m.periodo))
  const valido = periodos.length > 0 && new Set(periodos).size === periodos.length &&
    elegidos.length === periodos.length && elegidos.every((m) => m.pagado_centavos === 0 && m.monto_centavos !== null && m.monto_centavos > 0)
  return { valido, meses: elegidos, total: elegidos.reduce((total, m) => total + (m.monto_centavos ?? 0), 0) }
}

type ResumenPresupuesto = ReturnType<typeof resumenPresupuesto>

/** 'enero' → 'Enero': el nombre del mes de un período 'AAAA-MM-01', para encabezar una fila. */
export function nombreMes(periodo: string): string {
  const nombre = MESES[Number(periodo.slice(5, 7)) - 1]
  return nombre.charAt(0).toUpperCase() + nombre.slice(1)
}

/**
 * Presupuesto de un año a partir de las filas de sus 12 meses (en orden): el resumen de cada mes, el del
 * año y el de cada persona (la suma de lo que le toca y lo que pagó en el año). Una persona que entró a
 * mitad de año solo suma los meses en que le corresponde pagar. `sinCuota`: quienes no tuvieron cuota en
 * algún mes (su meta todavía no está en las cifras).
 */
export function resumenAnual(filasPorMes: FilaPresupuesto[][]) {
  const meses = filasPorMes.map((filas, indice) => ({
    periodo: filas[0]?.periodo ?? null,
    indice,
    ...resumenPresupuesto(filas),
  }))
  const todas = filasPorMes.flat()
  const porPersona = new Map<string, { usuario_id: string; etiqueta: string; filas: FilaPresupuesto[] }>()
  for (const fila of todas) {
    const persona = porPersona.get(fila.usuario_id) ?? { usuario_id: fila.usuario_id, etiqueta: fila.etiqueta, filas: [] }
    persona.etiqueta = fila.etiqueta
    persona.filas.push(fila)
    porPersona.set(fila.usuario_id, persona)
  }
  const personas = [...porPersona.values()]
    .map((p) => ({ usuario_id: p.usuario_id, etiqueta: p.etiqueta, ...resumenPresupuesto(p.filas) }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es') || a.usuario_id.localeCompare(b.usuario_id))
  const sinCuota = [...new Set(todas.filter((f) => f.monto_centavos === null).map((f) => f.etiqueta))]
    .sort((a, b) => a.localeCompare(b, 'es'))
  return { meses, total: resumenPresupuesto(todas) as ResumenPresupuesto, personas, sinCuota }
}
