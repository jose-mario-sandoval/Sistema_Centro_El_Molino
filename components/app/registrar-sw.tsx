'use client'

import { useEffect } from 'react'

/** Registra /sw.js en todas las páginas (también en /login, para tener lista la página sin conexión). */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error) => console.error('[sw] no se pudo registrar el service worker', error))
  }, [])

  return null
}
