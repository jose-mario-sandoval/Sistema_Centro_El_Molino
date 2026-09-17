'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const ContextoAvisos = createContext<(mensaje: string) => void>(() => {})

export function ProveedorAvisos({ children }: { children: React.ReactNode }) {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mostrar = useCallback((texto: string) => {
    setMensaje(texto)
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => setMensaje(null), 2600)
  }, [])

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current)
  }, [])

  return (
    <ContextoAvisos.Provider value={mostrar}>
      {children}
      <div id="toast-root" aria-live="polite">
        {mensaje && <div className="toast">{mensaje}</div>}
      </div>
    </ContextoAvisos.Provider>
  )
}

export function useAviso() {
  return useContext(ContextoAvisos)
}
