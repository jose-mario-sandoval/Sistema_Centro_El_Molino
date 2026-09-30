'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const ContextoAvisos = createContext<(mensaje: string) => void>(() => {})

/** Cuánto se ve un aviso: 2,6 s los cortos; los largos, ~70 ms por letra (para leerlos con calma), hasta 10 s. */
export function duracionAviso(texto: string): number {
  return Math.min(10_000, Math.max(2600, texto.length * 70))
}

export function ProveedorAvisos({ children }: { children: React.ReactNode }) {
  const [mensaje, setMensaje] = useState<string | null>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  const mostrar = useCallback((texto: string) => {
    setMensaje(texto)
    if (temporizador.current) clearTimeout(temporizador.current)
    temporizador.current = setTimeout(() => setMensaje(null), duracionAviso(texto))
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
