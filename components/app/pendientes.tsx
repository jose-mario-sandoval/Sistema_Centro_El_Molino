'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { vigilarPendientes } from '@/lib/mensajes/vigilar-pendientes'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

/** Cantidad de mensajes esperando aprobación; null para quien no es Director (no se muestra ni se cuenta). */
const ContextoPendientes = createContext<number | null>(null)

export function textoPendientes(n: number): string {
  return n === 1 ? '1 mensaje pendiente de aprobación' : `${n} mensajes pendientes de aprobación`
}

/**
 * Globito del Director (spec 2026-09-26 §1.6). El layout de la app no se vuelve a renderizar al navegar, así
 * que el conteo del servidor (`inicial`) se quedaría viejo: lo mantiene vivo vigilarPendientes (tiempo real,
 * al volver a la pestaña, y reconectando si el canal se cae). Si el layout sí se vuelve a renderizar
 * (revalidatePath tras moderar, router.refresh), su conteo manda.
 */
export function ProveedorPendientes({ inicial, children }: { inicial: number | null; children: React.ReactNode }) {
  const [conteo, setConteo] = useState(inicial)
  const [inicialAnterior, setInicialAnterior] = useState(inicial)
  if (inicial !== inicialAnterior) {
    setInicialAnterior(inicial)
    setConteo(inicial)
  }
  const activo = inicial !== null

  useEffect(() => {
    if (!activo) return
    return vigilarPendientes({ supabase: crearClienteNavegador(), alContar: setConteo })
  }, [activo])

  return <ContextoPendientes.Provider value={conteo}>{children}</ContextoPendientes.Provider>
}

export function usePendientes(): number | null {
  return useContext(ContextoPendientes)
}

/** Número visible (oculto al lector de pantalla) y el texto completo para el lector. Sin nada que contar, nada. */
export function InsigniaConteo({ n, texto }: { n: number; texto: string }) {
  if (n <= 0) return null
  return (
    <>
      <span className="insignia-conteo" aria-hidden="true">
        {n > 99 ? '99+' : n}
      </span>
      <span className="sr-only">, {texto}</span>
    </>
  )
}

/** El globito de pendientes, para la navegación y la pestaña "Pendientes". */
export function InsigniaPendientes() {
  const n = usePendientes()
  if (!n) return null
  return <InsigniaConteo n={n} texto={textoPendientes(n)} />
}
