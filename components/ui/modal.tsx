'use client'

import { useEffect } from 'react'

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
  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') alCerrar()
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierto, alCerrar])

  if (!abierto) return null

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) alCerrar()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}>
        <h3>{titulo}</h3>
        {children}
      </div>
    </div>
  )
}
