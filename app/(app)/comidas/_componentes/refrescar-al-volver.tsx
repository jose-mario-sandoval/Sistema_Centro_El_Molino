'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function RefrescarAlVolver({ refrescarEnMs }: { refrescarEnMs: number }) {
  const router = useRouter()

  useEffect(() => {
    function alCambiarVisibilidad() {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    // La demora viene del servidor: el reloj o la zona del dispositivo no deciden cuándo
    // avanza el período editable. Al llegar la medianoche local, se pide la vista nueva.
    const temporizador = setTimeout(() => router.refresh(), Math.max(0, refrescarEnMs))
    return () => {
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      clearTimeout(temporizador)
    }
  }, [router, refrescarEnMs])

  return null
}
