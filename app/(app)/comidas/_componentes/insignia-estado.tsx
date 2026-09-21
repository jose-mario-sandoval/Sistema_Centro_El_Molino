import type { CSSProperties } from 'react'
import { Icono } from '@/components/ui/iconos'
import { INFO_ESTADO, type EstadoComida, type ValorComida } from '@/lib/comidas/tipos'

/**
 * Colores del estado como variables --c / --cbg, que globals.css usa para fondo, texto y borde.
 * Los tokens --st-<estado> y --st-<estado>-bg se nombran por interpolación: no renombrarlos.
 */
export function varsEstado(estado: EstadoComida): CSSProperties {
  return { '--c': `var(--st-${estado})`, '--cbg': `var(--st-${estado}-bg)` } as CSSProperties
}

/** Texto de la nota de un estado: 'Hora: 13:30' o lo que la persona escribió. */
export function textoNota(estado: EstadoComida, nota: string): string {
  return INFO_ESTADO[estado].nota === 'hora' ? `Hora: ${nota}` : nota
}

export function InsigniaEstado({ valor }: { valor: ValorComida | null }) {
  if (!valor)
    return (
      <span className="status-badge sin-definir">
        <Icono nombre="sinDefinir" />
        Sin definir
      </span>
    )
  return (
    <>
      <span className="status-badge" style={varsEstado(valor.estado)}>
        <Icono nombre={valor.estado} />
        {INFO_ESTADO[valor.estado].etiqueta}
      </span>
      {valor.nota && <span className="status-note">{valor.nota}</span>}
    </>
  )
}
