import { dolares, etiquetaPeriodo } from '@/lib/pensiones/calculos'
import type { CargaPush } from './mensajes-push'

/** El contrato admite solo siglas; no recibe nombre ni incluye identidad personal en la URL. */
export function cargaPagoPension(p: {
  pagoId: string
  siglas: string
  periodo: string
  abonoCentavos: number
  completado: boolean
}): CargaPush {
  return {
    titulo: 'Pago de pensión registrado',
    cuerpo: `${p.siglas}: ${dolares(p.abonoCentavos)} para ${etiquetaPeriodo(p.periodo)}. ${p.completado ? 'Pensión pagada.' : 'Abono parcial.'}`,
    url: `/pensiones/presupuesto?anio=${p.periodo.slice(0, 4)}&mes=${Number(p.periodo.slice(5, 7))}`,
    etiqueta: `pension-${p.pagoId}`,
  }
}
