'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { usePendientes } from '@/components/app/pendientes'

/** Varios cambios seguidos del globito piden una sola recarga de la cola. */
const RETARDO_MS = 600

/**
 * La cola de moderación la arma el servidor; el globito se actualiza en vivo. Si el número cambia con la cola
 * en pantalla ("dice 4 y veo 3"), se vuelve a pedir la página para que coincidan. Las filas conservan lo que
 * el Director estaba escribiendo (van por clave). Después de refrescar, el conteo del servidor coincide con el
 * del globito y no se vuelve a disparar.
 */
export function RefrescarColaAlCambiar() {
  const pendientes = usePendientes()
  const router = useRouter()
  const mostrado = useRef(pendientes)

  useEffect(() => {
    if (pendientes === mostrado.current) return
    const temporizador = setTimeout(() => {
      mostrado.current = pendientes
      router.refresh()
    }, RETARDO_MS)
    return () => clearTimeout(temporizador)
  }, [pendientes, router])

  return null
}
