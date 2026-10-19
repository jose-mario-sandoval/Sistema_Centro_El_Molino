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
}

export type FilaPresupuesto = MesPension & { usuario_id: string; etiqueta: string }

export type PagoPension = {
  periodo: string
  categoria: string
  monto_centavos: number
  registrado_en: string
}
