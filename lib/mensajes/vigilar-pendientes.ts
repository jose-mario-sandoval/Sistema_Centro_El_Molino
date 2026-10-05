import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import { crearReintento, esperaReintento } from '@/lib/mensajes/reintentos'
import type { Database } from '@/lib/supabase/database.types'

/** Varios cambios seguidos (aprobar en tanda, una publicación con respuestas) se cuentan una sola vez. */
export const RETARDO_RECUENTO_MS = 800

/** Lo que se usa de `document`: la visibilidad de la pestaña (inyectable para las pruebas). */
export type DocumentoVisible = Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>

/**
 * Mantiene al día el globito de pendientes del Director (components/app/pendientes.tsx): recuenta
 * (`head: true`, sin traer filas) ante cada cambio de `mensajes` en tiempo real, al (re)conectarse y al volver
 * a la pestaña. El globito existe para avisar: si el canal se cierra (realtime-js lo descarta) o no hay token
 * para abrirlo, se crea otro con la misma espera creciente que el feed (use-canal-mensajes.ts), en pausa
 * mientras la pestaña está oculta. Devuelve la función que lo detiene.
 */
export function vigilarPendientes({
  supabase,
  alContar,
  documento = document,
}: {
  supabase: SupabaseClient<Database>
  alContar: (n: number) => void
  documento?: DocumentoVisible
}): () => void {
  let detenido = false
  let canal: RealtimeChannel | undefined
  let intentos = 0
  let temporizador: ReturnType<typeof setTimeout> | undefined
  const reintento = crearReintento(() => void suscribir(), () => documento.hidden)

  async function recontar() {
    const { count, error } = await supabase
      .from('mensajes')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'pendiente')
    // Si falla, queda el último conteo: el próximo cambio o volver a la pestaña lo corrige.
    if (!detenido && !error && count !== null) alContar(count)
  }

  function recontarLuego() {
    clearTimeout(temporizador)
    temporizador = setTimeout(() => void recontar(), RETARDO_RECUENTO_MS)
  }

  function reconectarLuego() {
    reintento.programar(esperaReintento(intentos++))
  }

  function alCambiarVisibilidad() {
    if (documento.hidden) return
    recontarLuego()
    reintento.ahora()
  }

  async function suscribir() {
    if (canal) {
      void supabase.removeChannel(canal)
      canal = undefined
    }
    // Igual que use-canal-mensajes.ts: sin el token de la sesión, RLS no deja ver ningún evento.
    try {
      await supabase.realtime.setAuth()
    } catch {
      if (!detenido) reconectarLuego()
      return
    }
    if (detenido) return
    const este = supabase.channel(`pendientes-${Math.random().toString(36).slice(2)}`)
    canal = este
    este
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensajes' }, recontarLuego)
      .subscribe((estado) => {
        // Lo que avise un canal ya reemplazado (o después de detener) no cuenta.
        if (detenido || canal !== este) return
        if (estado === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          intentos = 0
          // Cubre lo que pasó mientras no estaba suscrito.
          recontarLuego()
          return
        }
        // CHANNEL_ERROR y TIMED_OUT: realtime-js reintenta solo. CLOSED: ese canal ya no sirve.
        if (estado === REALTIME_SUBSCRIBE_STATES.CLOSED) reconectarLuego()
      })
  }

  documento.addEventListener('visibilitychange', alCambiarVisibilidad)
  void suscribir()

  return () => {
    detenido = true
    clearTimeout(temporizador)
    reintento.cancelar()
    documento.removeEventListener('visibilitychange', alCambiarVisibilidad)
    if (canal) void supabase.removeChannel(canal)
  }
}
