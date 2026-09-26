'use client'

import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState } from 'react'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

/** Cantidad de mensajes esperando aprobación; null para quien no es Director (no se muestra ni se cuenta). */
const ContextoPendientes = createContext<number | null>(null)

/** Varios cambios seguidos (aprobar en tanda, una publicación con respuestas) se cuentan una sola vez. */
const RETARDO_RECUENTO_MS = 800

export function textoPendientes(n: number): string {
  return n === 1 ? '1 mensaje pendiente de aprobación' : `${n} mensajes pendientes de aprobación`
}

/**
 * Globito del Director (spec 2026-09-26 §1.6). El layout de la app no se vuelve a renderizar al navegar, así
 * que el conteo del servidor (`inicial`) se quedaría viejo: se mantiene vivo recontando (`head: true`, sin
 * traer filas) ante cada cambio de `mensajes` en tiempo real y al volver a la pestaña. Si el layout sí se
 * vuelve a renderizar (revalidatePath tras moderar), su conteo manda.
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
    const supabase = crearClienteNavegador()
    let cancelado = false
    let temporizador: ReturnType<typeof setTimeout> | undefined
    let canal: RealtimeChannel | undefined

    async function recontar() {
      const { count, error } = await supabase
        .from('mensajes')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'pendiente')
      // Si falla, queda el último conteo: el próximo cambio o volver a la pestaña lo corrige.
      if (!cancelado && !error && count !== null) setConteo(count)
    }
    function recontarLuego() {
      clearTimeout(temporizador)
      temporizador = setTimeout(() => void recontar(), RETARDO_RECUENTO_MS)
    }
    function alCambiarVisibilidad() {
      if (!document.hidden) recontarLuego()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    async function suscribir() {
      // Igual que use-canal-mensajes.ts: sin el token de la sesión, RLS no deja ver ningún evento.
      try {
        await supabase.realtime.setAuth()
      } catch {
        return
      }
      if (cancelado) return
      canal = supabase
        .channel(`pendientes-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes' }, recontarLuego)
        .subscribe((estado) => {
          // Al (re)conectarse recuenta: cubre lo que pasó mientras no estaba suscrito.
          if (estado === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) recontarLuego()
        })
    }
    void suscribir()

    return () => {
      cancelado = true
      clearTimeout(temporizador)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      if (canal) void supabase.removeChannel(canal)
    }
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
