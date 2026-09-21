'use client'

import { useEffect, useRef } from 'react'

const SELECTOR_ENFOCABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export function Modal({
  titulo,
  abierto,
  alCerrar,
  bloquearCierre = false,
  enfocarDialogo = false,
  children,
}: {
  titulo: string
  abierto: boolean
  alCerrar: () => void
  /** Ignora Escape y el clic en el fondo (p. ej. mientras corre una acción); los botones del contenido deciden. */
  bloquearCierre?: boolean
  /**
   * Al abrir, el foco va al diálogo y no a su primer campo: en el teléfono, enfocar un campo de
   * texto abre el teclado sin que la persona lo haya pedido.
   */
  enfocarDialogo?: boolean
  children: React.ReactNode
}) {
  const dialogo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto || bloquearCierre) return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierto, bloquearCierre, alCerrar])

  // Foco accesible: al abrir entra al diálogo; al cerrar vuelve al elemento que lo tenía.
  // No depende de alCerrar para no robar el foco en cada render (suele ser una función nueva).
  useEffect(() => {
    if (!abierto) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const contenedor = dialogo.current
    if (contenedor) {
      const primero = enfocarDialogo ? null : contenedor.querySelector<HTMLElement>(SELECTOR_ENFOCABLE)
      ;(primero ?? contenedor).focus()
    }
    return () => {
      if (anterior?.isConnected) anterior.focus()
    }
  }, [abierto, enfocarDialogo])

  if (!abierto) return null

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !bloquearCierre) alCerrar()
      }}
    >
      <div ref={dialogo} className="modal" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1}>
        <h3>{titulo}</h3>
        {children}
      </div>
    </div>
  )
}
