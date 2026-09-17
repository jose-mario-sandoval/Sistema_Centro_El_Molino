'use client'

import { useRouter } from 'next/navigation'
import { startTransition, useEffect } from 'react'

/** Error no controlado por encima de las secciones (por ejemplo, la base no responde al cargar el layout). */
export default function ErrorGlobal({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="content">
      <div className="page-head">
        <h1>Algo salió mal</h1>
        <div className="desc">No pudimos cargar la aplicación. Revisá tu conexión e intentá de nuevo.</div>
      </div>
      <div className="card">
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
    </main>
  )
}
