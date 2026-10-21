import { dolares, etiquetaPeriodo, saldoMes } from './calculos'
import type { MesDonacion } from './donaciones'
import type { MesPension } from './tipos'

/** El período es explícito también al consultar otro año; no se presenta una proyección como el mes actual. */
export function resumenMiPension(mes: MesPension | undefined, periodo: string): string {
  const etiqueta = etiquetaPeriodo(periodo)
  if (!mes) return `${etiqueta} · Sin información disponible`
  if (mes.exento) return `${etiqueta} · Exento de pensión · ${dolares(0)}`
  if (mes.monto_centavos === null) return `${etiqueta} · Sin cuota configurada`
  const saldo = saldoMes(mes)
  if (saldo > 0) return `${etiqueta} · ${mes.pagado_centavos > 0 ? 'Pago parcial' : 'Pendiente'} · Falta ${dolares(saldo)}`
  return `${etiqueta} · Pagado · ${dolares(mes.pagado_centavos)}`
}

export function resumenDonacion(mes: MesDonacion | undefined, periodo: string): string {
  const etiqueta = etiquetaPeriodo(periodo)
  if (!mes) return `${etiqueta} · Sin información disponible`
  const monto = mes.monto_centavos === null ? '' : ` · ${dolares(mes.monto_centavos)}`
  if (mes.recibido_en) return `${etiqueta} · Recibida${monto}`
  if (mes.monto_centavos === null) return `${etiqueta} · Sin donación configurada`
  return `${etiqueta} · Pendiente de recibir${monto}`
}
