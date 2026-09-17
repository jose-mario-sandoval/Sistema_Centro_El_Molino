'use client'

import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
} from '@supabase/supabase-js'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { leerEvento, type EventoLeido } from '@/lib/mensajes/tiempo-real'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

export type Conexion = 'conectando' | 'en-vivo' | 'reconectando'
/** `descartada`: otra recarga empezó después y es la que vale. */
export type ResultadoRecarga = 'ok' | 'fallo' | 'descartada'

const ESPERA_REINTENTO_MS = 3000

/**
 * Suscripción a Postgres Changes de mensajes y reacciones (spec §7).
 * "en-vivo" significa suscrito y con el feed recargado después de la última caída: hasta que `recargar`
 * responde 'ok' se muestra "Reconectando…" y se reintenta, para no presentar datos viejos como actuales.
 */
export function useCanalMensajes({
  alEvento,
  recargar,
}: {
  alEvento: (evento: EventoLeido) => void
  recargar: () => Promise<ResultadoRecarga>
}): Conexion {
  const [conexion, setConexion] = useState<Conexion>('conectando')
  const [intentoCanal, setIntentoCanal] = useState(0)
  // Empieza en true: el primer SUBSCRIBED también recarga. Cubre lo publicado entre el render del servidor
  // y la suscripción, y los datos viejos que devuelve el caché del router al volver con atrás/adelante.
  const huboCaida = useRef(true)

  const alCambio = useEffectEvent((payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
    const leido = leerEvento(payload)
    if (leido) alEvento(leido)
  })
  const recargarFeed = useEffectEvent(() => recargar())

  useEffect(() => {
    const supabase = crearClienteNavegador()
    let cancelado = false
    let suscrito = false
    let reintentoCanal: ReturnType<typeof setTimeout> | undefined
    let reintentoRecarga: ReturnType<typeof setTimeout> | undefined
    let canal: RealtimeChannel | undefined

    function marcarCaida() {
      suscrito = false
      huboCaida.current = true
      clearTimeout(reintentoRecarga)
      setConexion('reconectando')
    }

    function nuevoCanalLuego() {
      clearTimeout(reintentoCanal)
      reintentoCanal = setTimeout(() => setIntentoCanal((n) => n + 1), ESPERA_REINTENTO_MS)
    }

    async function sincronizar() {
      const resultado = await recargarFeed()
      // Si el canal se cayó mientras tanto, el próximo SUBSCRIBED vuelve a recargar.
      if (cancelado || !suscrito || resultado === 'descartada') return
      if (resultado === 'ok') {
        huboCaida.current = false
        setConexion('en-vivo')
        return
      }
      setConexion('reconectando')
      clearTimeout(reintentoRecarga)
      reintentoRecarga = setTimeout(() => void sincronizar(), ESPERA_REINTENTO_MS)
    }

    async function suscribir() {
      // El join del canal se arma al llamar a subscribe() y lleva el token que Realtime tenga en ese momento.
      // Sin esperar a la sesión sale solo con la llave pública (rol anon): RLS no deja ver las filas y los
      // eventos llegan vacíos ("Error 401"). setAuth() sin argumento toma el token de la sesión actual.
      try {
        await supabase.realtime.setAuth()
      } catch {
        // Sin token no llegarían eventos: se reintenta igual que con un canal cerrado.
        if (cancelado) return
        marcarCaida()
        nuevoCanalLuego()
        return
      }
      if (cancelado) return

      canal = supabase
        // wait: SUBSCRIBED llega recién cuando el servidor confirma la suscripción a Postgres Changes,
        // así la recarga posterior no deja huecos.
        .channel(`mensajes-${Math.random().toString(36).slice(2)}`, {
          config: { postgres_changes_options: { wait: true } },
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes' }, (payload) => alCambio(payload))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reacciones' }, (payload) => alCambio(payload))
        .subscribe((estado) => {
          if (cancelado) return
          if (estado === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            suscrito = true
            if (huboCaida.current) void sincronizar()
            else setConexion('en-vivo')
            return
          }
          // CHANNEL_ERROR y TIMED_OUT: el cliente reintenta solo. CLOSED: se crea un canal nuevo.
          marcarCaida()
          if (estado === REALTIME_SUBSCRIBE_STATES.CLOSED) nuevoCanalLuego()
        })
    }
    void suscribir()

    return () => {
      cancelado = true
      clearTimeout(reintentoCanal)
      clearTimeout(reintentoRecarga)
      if (canal) void supabase.removeChannel(canal)
    }
  }, [intentoCanal])

  return conexion
}
