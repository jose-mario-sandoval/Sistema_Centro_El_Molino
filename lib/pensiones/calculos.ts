import { fechaISOEn } from '@/lib/fechas'
import { MESES } from '@/lib/fechas/etiquetas'
import type { MesPension } from './tipos'

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
