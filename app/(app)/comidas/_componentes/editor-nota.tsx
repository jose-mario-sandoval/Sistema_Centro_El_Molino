'use client'

import { useId } from 'react'
import { LARGO_MAXIMO_NOTA } from '@/lib/comidas/notas'
import type { TipoNota } from '@/lib/comidas/tipos'

/**
 * El campo de hora (temprano, tarde) o de nota (enfermo) de una comida, el mismo en Plan, Semana y
 * La casa (DESIGN.md §8). Hundido, con su etiqueta escrita. Solo pinta; guardar es de quien lo usa.
 */
export function EditorNota({
  tipo,
  etiqueta,
  valor,
  alCambiar,
  alGuardar,
  alCancelar,
  alSalir,
  pendiente,
  error,
  enfocar,
}: {
  tipo: NonNullable<TipoNota>
  /** 'Hora' / 'Qué podés comer' */
  etiqueta: string
  valor: string
  alCambiar: (valor: string) => void
  alGuardar: () => void
  /** Si está, aparece "Cancelar". */
  alCancelar?: () => void
  /** Al salir del campo (el Plan guarda solo si la nota ya es válida). */
  alSalir?: () => void
  pendiente: boolean
  /** Qué falta para poder guardar. */
  error?: string | null
  /** La persona acaba de elegir un estado que pide nota: el teclado es lo esperado. */
  enfocar?: boolean
}) {
  const id = useId()
  const idError = useId()

  return (
    <form
      className="note-field editor-nota"
      onSubmit={(e) => {
        e.preventDefault()
        if (!pendiente) alGuardar()
      }}
    >
      <label htmlFor={id}>{etiqueta}</label>
      <input
        id={id}
        type={tipo === 'hora' ? 'time' : 'text'}
        maxLength={tipo === 'texto' ? LARGO_MAXIMO_NOTA : undefined}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        onBlur={alSalir}
        required
        aria-describedby={error ? idError : undefined}
        autoFocus={enfocar}
      />
      {error && (
        <div id={idError} className="hint">
          {error}
        </div>
      )}
      <div className="acciones-formulario">
        {/* Guardando: aria-disabled y no disabled, para no perder el foco del teclado. */}
        <button type="submit" className="btn" aria-disabled={pendiente || undefined}>
          Guardar
        </button>
        {alCancelar && (
          <button
            type="button"
            className="btn ghost"
            aria-disabled={pendiente || undefined}
            onClick={() => {
              if (!pendiente) alCancelar()
            }}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}
