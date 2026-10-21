import { z } from 'zod'
import { centavosDesdeTexto } from './calculos'
import { esquemaPeriodoPension } from '@/lib/validacion/pensiones'

export type ConfiguracionDonacion = { desde: string; monto_centavos: number }
export type MesDonacion = {
  periodo: string
  monto_centavos: number | null
  recibido_en: string | null
  registrado_por: string | null
}

export const esquemaConfiguracionDonacion = z.object({
  desde: esquemaPeriodoPension,
  monto: z.string().transform((valor, ctx) => {
    const centavos = centavosDesdeTexto(valor)
    if (centavos === null) {
      ctx.addIssue({ code: 'custom', message: 'Ingresá un monto mayor que cero, hasta $1,000,000 y con un máximo de dos decimales.' })
      return z.NEVER
    }
    return centavos
  }),
})

export const esquemaRecibirDonacion = z.object({
  periodo: esquemaPeriodoPension,
  monto_esperado: z.number().int().min(1).max(100_000_000),
})
