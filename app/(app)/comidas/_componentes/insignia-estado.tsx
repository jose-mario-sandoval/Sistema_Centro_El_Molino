import type { CSSProperties } from 'react'
import { INFO_ESTADO, type EstadoComida, type ValorComida } from '@/lib/comidas/tipos'

/** Colores del prototipo: --st-<estado> y --st-<estado>-bg. */
export function estiloEstado(estado: EstadoComida): CSSProperties {
  return { background: `var(--st-${estado}-bg)`, color: `var(--st-${estado})` }
}

export function InsigniaEstado({ valor }: { valor: ValorComida | null }) {
  if (!valor) return <span className="status-note">Sin definir</span>
  return (
    <>
      <span className="status-badge" style={estiloEstado(valor.estado)}>
        {INFO_ESTADO[valor.estado].etiqueta}
      </span>
      {valor.nota && <span className="status-note">{valor.nota}</span>}
    </>
  )
}
