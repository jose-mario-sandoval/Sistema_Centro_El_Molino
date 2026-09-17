'use client'

import { useRouter } from 'next/navigation'
import { startTransition } from 'react'

export default function ErrorMensajes({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()

  return (
    <div className="card">
      <div className="empty-state">
        <p>No se pudieron cargar los mensajes.</p>
        <button
          type="button"
          className="btn small"
          style={{ marginTop: 12 }}
          // reset() solo vuelve a renderizar en el cliente: refresh() pide de nuevo el Server Component.
          onClick={() =>
            startTransition(() => {
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
