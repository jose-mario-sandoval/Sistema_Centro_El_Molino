import { z } from 'zod'
import { centavosDesdeTexto } from '@/lib/pensiones/calculos'
import { CATEGORIAS_PENSION } from '@/lib/pensiones/tipos'

export const esquemaPeriodoPension = z.string().regex(/^(20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])-01$/, 'Elegí un mes entre 2000 y 2200.')
export const esquemaAnioPension = z.coerce.number().int().min(2000).max(2200)
export const esquemaCuotaPension = z.object({
  usuario_id: z.uuid(),
  desde: esquemaPeriodoPension,
  categoria: z.enum(CATEGORIAS_PENSION, { error: 'Elegí una categoría.' }),
  monto: z.string().transform((valor, ctx) => {
    const centavos = centavosDesdeTexto(valor)
    if (centavos === null) {
      ctx.addIssue({ code: 'custom', message: 'Ingresá un monto mayor que cero, hasta $1,000,000 y con un máximo de dos decimales.' })
      return z.NEVER
    }
    return centavos
  }),
})

export const esquemaMarcarPensiones = z.object({
  periodos: z.array(esquemaPeriodoPension).min(1).max(12).refine((p) => new Set(p).size === p.length, 'No repitás meses.'),
  // La confirmación muestra las cuotas leídas por el servidor. La RPC vuelve a calcularlas
  // bajo bloqueo; si cambiaron, aborta toda la operación y pide revisar el total nuevamente.
  montos: z.array(z.number().int().min(1).max(100_000_000)).min(1).max(12),
  // Pagos parciales. `pagados`: lo ya pagado de cada mes que vio la persona (si cambió, p. ej. por un doble clic, la
  // base aborta). `abonos`: cuánto paga ahora de cada mes; sin él, paga todo lo que falta.
  pagados: z.array(z.number().int().min(0).max(100_000_000)).min(1).max(12).optional(),
  abonos: z.array(z.number().int().min(1).max(100_000_000)).min(1).max(12).optional(),
}).refine(
  (e) => e.periodos.length === e.montos.length
    && (e.pagados === undefined || e.pagados.length === e.periodos.length)
    && (e.abonos === undefined || e.abonos.length === e.periodos.length),
  'Revisá los meses y sus montos.',
).refine((e) => e.abonos === undefined || e.pagados !== undefined, 'Revisá lo ya pagado antes de confirmar un abono parcial.')

/** Conserva todas las validaciones del pago propio al registrar para otra persona. */
export const esquemaMarcarPensionesDe = esquemaMarcarPensiones.safeExtend({ usuario_id: z.uuid() })
