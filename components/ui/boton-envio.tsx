'use client'

import { useFormStatus } from 'react-dom'

export function BotonEnvio({
  children,
  textoPendiente = 'Guardando…',
  className = 'btn',
}: {
  children: React.ReactNode
  textoPendiente?: string
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? textoPendiente : children}
    </button>
  )
}
