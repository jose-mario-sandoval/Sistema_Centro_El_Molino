'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function RefrescarAlVolver() {
  const router = useRouter()

  useEffect(() => {
    function alCambiarVisibilidad() {
      if (document.visibilityState === 'visible') router.refresh()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  }, [router])

  return null
}
