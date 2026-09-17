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
  children,
}: {
  titulo: string
  abierto: boolean
  alCerrar: () => void
  children: React.ReactNode
}) {
  const dialogo = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierto, alCerrar])

  // Foco accesible: al abrir entra al diálogo; al cerrar vuelve al elemento que lo tenía.
  // Depende solo de `abierto` para no robar el foco en cada render (alCerrar suele ser una función nueva).
  useEffect(() => {
    if (!abierto) return
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const contenedor = dialogo.current
    if (contenedor) {
      const primero = contenedor.querySelector<HTMLElement>(SELECTOR_ENFOCABLE)
      ;(primero ?? contenedor).focus()
    }
    return () => {
      if (anterior?.isConnected) anterior.focus()
    }
  }, [abierto])

  if (!abierto) return null

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar()
      }}
    >
      <div ref={dialogo} className="modal" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1}>
        <h3>{titulo}</h3>
        {children}
      </div>
    </div>
  )
}
