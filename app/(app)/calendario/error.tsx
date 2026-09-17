'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

export default function ErrorCalendario({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()
  const [pendiente, iniciar] = useTransition()

  return (
    <div className="card">
      <div className="empty-state">
        <p>No se pudo cargar el calendario.</p>
        <button
          type="button"
          className="btn small"
          disabled={pendiente}
          onClick={() =>
            iniciar(() => {
              router.refresh()
              reset()
            })
          }
        >
          Reintentar
        </button>
      </div>
    </div>
  )
}
