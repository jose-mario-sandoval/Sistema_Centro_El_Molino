'use client'

import { useId } from 'react'
import { LARGO_MAXIMO_NOTA } from '@/lib/comidas/notas'
import { INFO_ESTADO, type EstadoComida } from '@/lib/comidas/tipos'
import type { BorradorNota } from './usar-borrador-nota'

/**
 * El campo de hora (temprano, tarde) o de nota (enfermo) de una comida: el mismo, con el mismo
 * comportamiento, en Plan, Semana y La casa (DESIGN.md §8). Aparece al elegir un estado que lo pide y
 * toma el foco. "Guardar" (o cerrar la burbuja) guarda lo escrito si sirve; si no, el motivo va debajo
 * del campo. "Cancelar" lo descarta. La lógica está en `useBorradorNota` (ver `propsEditorNota`);
 * esto solo pinta. Quien lo usa le pone `key={estado}`: al pasar de un estado a otro vuelve a empezar
 * (y a tomar el foco).
 */
export function EditorNota({
  estado,
  etiqueta,
  valor,
  error,
  campo,
  alCambiar,
  alGuardar,
  alCancelar,
  pendiente,
}: {
  /** Un estado que lleva nota. */
  estado: EstadoComida
  /** Por defecto 'Hora' o 'Qué podés comer'. */
  etiqueta?: string
  valor: string
  /** Por qué no se pudo guardar o cerrar. */
  error: string | null
  /** Para que quien guarda devuelva el foco al campo cuando hay un error. */
  campo: BorradorNota['campo']
  alCambiar: (valor: string) => void
  alGuardar: () => void
  alCancelar: () => void
  /** Guardando: los botones siguen enfocables pero no responden. */
  pendiente: boolean
}) {
  const id = useId()
  const idError = useId()
  const tipo = INFO_ESTADO[estado].nota

  return (
    <form
      className="note-field editor-nota"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        if (!pendiente) alGuardar()
      }}
    >
      <label htmlFor={id}>{etiqueta ?? (tipo === 'hora' ? 'Hora' : 'Qué podés comer')}</label>
      <input
        ref={campo}
        id={id}
        type={tipo === 'hora' ? 'time' : 'text'}
        maxLength={tipo === 'texto' ? LARGO_MAXIMO_NOTA : undefined}
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? idError : undefined}
        // La persona acaba de elegir un estado que pide nota: el teclado es lo esperado.
        autoFocus
      />
      {error && (
        <div id={idError} className="campo-error" role="alert">
          {error}
        </div>
      )}
      <div className="acciones-formulario">
        {/* Guardando: aria-disabled y no disabled, para no perder el foco del teclado. */}
        <button type="submit" className="btn" aria-disabled={pendiente || undefined}>
          Guardar
        </button>
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
      </div>
    </form>
  )
}
