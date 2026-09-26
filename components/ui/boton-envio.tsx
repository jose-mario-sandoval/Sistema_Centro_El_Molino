'use client'

import { useFormStatus } from 'react-dom'

export function BotonEnvio({
  children,
  textoPendiente = 'Guardando…',
  className = 'btn',
  deshabilitado = false,
}: {
  children: React.ReactNode
  textoPendiente?: string
  className?: string
  /** Todavía no hay nada que enviar (ej.: falta elegir un día). */
  deshabilitado?: boolean
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={className} disabled={pending || deshabilitado} aria-busy={pending}>
      {pending ? textoPendiente : children}
    </button>
  )
}
