'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useEffect } from 'react'

export default function ErrorConfiguraciones({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <>
      <div className="page-head">
        <h1>Configuraciones</h1>
      </div>
      <div className="card">
        <div className="empty-state">
          <p>No se pudo cargar esta sección.</p>
          <div className="acciones-formulario" style={{ justifyContent: 'center' }}>
            {/* `reset()` solo vuelve a pintar el segmento: `router.refresh()` vuelve a pedir los datos al servidor (igual que app/error.tsx). */}
            <button
              type="button"
              className="btn"
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
      </div>
    </>
  )
}
