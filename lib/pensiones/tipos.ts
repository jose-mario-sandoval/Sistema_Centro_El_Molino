export const CATEGORIAS_PENSION = ['universitario', 'profesional'] as const
export type CategoriaPension = typeof CATEGORIAS_PENSION[number]
export const ETIQUETA_CATEGORIA: Record<CategoriaPension, string> = {
  universitario: 'Universitario',
  profesional: 'Profesional',
}

export type MesPension = {
  periodo: string
  categoria: string | null
  monto_centavos: number | null
  pagado_centavos: number
  registrado_en: string | null
  exento: boolean
}

/** La donación es un concepto compartido, nunca la identidad de una persona. */
export type FilaPresupuesto = MesPension & { etiqueta: string } & (
  | { concepto: 'pension'; usuario_id: string }
  | { concepto: 'donacion'; usuario_id: null }
)

/** Un abono: `abono_centavos` es lo que se pagó en ese momento y `monto_centavos`, la cuota de ese mes. */
export type PagoPension = {
  id: string
  periodo: string
  categoria: string
  monto_centavos: number
  abono_centavos: number
  registrado_en: string
}
