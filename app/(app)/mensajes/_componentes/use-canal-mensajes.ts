'use client'

import {
  REALTIME_SUBSCRIBE_STATES,
  type RealtimeChannel,
  type RealtimePostgresChangesPayload,
} from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import {
  crearReintento,
  esperaReintento,
  RACHA_INICIAL,
  registrarFallo,
  type RachaFallos,
} from '@/lib/mensajes/reintentos'
import { leerEvento, type EventoLeido } from '@/lib/mensajes/tiempo-real'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

export type Conexion = 'conectando' | 'en-vivo' | 'reconectando'
/** `descartada`: otra recarga empezó después y es la que vale. */
export type ResultadoRecarga = 'ok' | 'fallo' | 'descartada'

/**
 * Suscripción a Postgres Changes de mensajes y reacciones (spec §7).
 * "en-vivo" significa suscrito y con el feed recargado después de la última caída: hasta que `recargar`
 * responde 'ok' se muestra "Reconectando…" y se reintenta, para no presentar datos viejos como actuales.
 * Los reintentos esperan cada vez más (3 s a 5 min, con azar), se pausan con la pestaña oculta y corren
 * apenas vuelve a estar visible.
 */
export function useCanalMensajes({
  alEvento,
  recargar,
}: {
  alEvento: (evento: EventoLeido) => void
  recargar: () => Promise<ResultadoRecarga>
}): Conexion {
  const router = useRouter()
  const [conexion, setConexion] = useState<Conexion>('conectando')
  const [intentoCanal, setIntentoCanal] = useState(0)
  // Empieza en true: el primer SUBSCRIBED también recarga. Cubre lo publicado entre el render del servidor
  // y la suscripción, y los datos viejos que devuelve el caché del router al volver con atrás/adelante.
  const huboCaida = useRef(true)
  // Sobreviven a la recreación del canal (cada canal nuevo vuelve a correr el efecto); se reinician al
  // sincronizar bien.
  const intentos = useRef({ recarga: 0, canal: 0 })
  const racha = useRef<RachaFallos>(RACHA_INICIAL)

  const alCambio = useEffectEvent((payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
    const leido = leerEvento(payload)
    if (leido) alEvento(leido)
  })
  const recargarFeed = useEffectEvent(() => recargar())
  const refrescarRuta = useEffectEvent(() => router.refresh())

  useEffect(() => {
    const supabase = crearClienteNavegador()
    const estaOculta = () => document.hidden
    let cancelado = false
    let suscrito = false
    let canal: RealtimeChannel | undefined
    const reintentoCanal = crearReintento(() => setIntentoCanal((n) => n + 1), estaOculta)
    const reintentoRecarga = crearReintento(() => void sincronizar(), estaOculta)

    function alCambiarVisibilidad() {
      if (document.hidden) return
      reintentoCanal.ahora()
      reintentoRecarga.ahora()
    }
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    function marcarEnVivo() {
      huboCaida.current = false
      intentos.current = { recarga: 0, canal: 0 }
      racha.current = RACHA_INICIAL
      setConexion('en-vivo')
    }

    function marcarCaida() {
      suscrito = false
      huboCaida.current = true
      reintentoRecarga.cancelar()
      setConexion('reconectando')
    }

    function nuevoCanalLuego() {
      reintentoCanal.programar(esperaReintento(intentos.current.canal++))
    }

    async function sincronizar() {
      const resultado = await recargarFeed()
      // Si el canal se cayó mientras tanto, el próximo SUBSCRIBED vuelve a recargar.
      if (cancelado || !suscrito || resultado === 'descartada') return
      if (resultado === 'ok') {
        marcarEnVivo()
        return
      }
      setConexion('reconectando')
      const fallo = registrarFallo(racha.current, navigator.onLine)
      racha.current = fallo.racha
      // Una sola vez por racha: si la sesión venció, exigirPerfil redirige a /login; si hubo un despliegue
      // nuevo, Next hace una navegación completa. Si no era eso, los reintentos siguen igual.
      if (fallo.refrescar) refrescarRuta()
      reintentoRecarga.programar(esperaReintento(intentos.current.recarga++))
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
            else marcarEnVivo()
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
      reintentoCanal.cancelar()
      reintentoRecarga.cancelar()
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      if (canal) void supabase.removeChannel(canal)
    }
  }, [intentoCanal])

  return conexion
}
