'use client'

import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from '@supabase/supabase-js'
import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import type { PaginaFeed } from '@/lib/mensajes/consultas'
import {
  agregarAnteriores,
  alternarReaccionLocal,
  aplicarBorradoMensaje,
  aplicarInsercionMensaje,
  cursorAnteriores,
  fijarReaccion,
  type MensajeFila,
  type ReaccionFila,
} from '@/lib/mensajes/feed'
import type { PerfilResumen } from '@/lib/perfiles/consultas'
import { crearClienteNavegador } from '@/lib/supabase/navegador'
import { alternarReaccion, borrarMensaje, cargarMensajes, cargarPerfiles } from '../acciones'
import { ConfirmarBorrado } from './confirmar-borrado'
import { FormularioPublicar } from './formulario-publicar'
import { TarjetaMensaje, type PedidoBorrado, type UsuarioFeed } from './tarjeta-mensaje'

type Conexion = 'conectando' | 'en-vivo' | 'reconectando'

function indexar(perfiles: PerfilResumen[]): Record<string, PerfilResumen> {
  return Object.fromEntries(perfiles.map((p) => [p.id, p]))
}

export function FeedMensajes({
  inicial,
  perfiles: perfilesIniciales,
  usuario,
  generadoEn,
}: {
  inicial: PaginaFeed
  perfiles: PerfilResumen[]
  usuario: UsuarioFeed
  generadoEn: string
}) {
  const aviso = useAviso()
  const [publicaciones, setPublicaciones] = useState(inicial.publicaciones)
  const [hayMas, setHayMas] = useState(inicial.hayMas)
  const [perfiles, setPerfiles] = useState(() => indexar(perfilesIniciales))
  const [conexion, setConexion] = useState<Conexion>('conectando')
  const [intentoCanal, setIntentoCanal] = useState(0)
  const [ahora, setAhora] = useState(() => new Date(generadoEn))
  const [pedidoBorrado, setPedidoBorrado] = useState<PedidoBorrado | null>(null)
  const [borrando, iniciarBorrado] = useTransition()
  const [cargandoAnteriores, iniciarCargaAnteriores] = useTransition()
  const huboCaida = useRef(false)
  const recargandoPerfiles = useRef(false)

  // "hace cuánto" se actualiza cada minuto.
  useEffect(() => {
    const reloj = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(reloj)
  }, [])

  const recargarPerfiles = useEffectEvent(async () => {
    if (recargandoPerfiles.current) return
    recargandoPerfiles.current = true
    try {
      const resultado = await cargarPerfiles()
      if (resultado.ok) setPerfiles(indexar(resultado.data))
    } finally {
      recargandoPerfiles.current = false
    }
  })

  const recargarTodo = useEffectEvent(async () => {
    try {
      const [mensajes, listaPerfiles] = await Promise.all([cargarMensajes({ antesDe: null }), cargarPerfiles()])
      if (listaPerfiles.ok) setPerfiles(indexar(listaPerfiles.data))
      if (!mensajes.ok) {
        aviso(mensajes.error)
        return
      }
      setPublicaciones(mensajes.data.publicaciones)
      setHayMas(mensajes.data.hayMas)
    } catch {
      aviso('No se pudieron recargar los mensajes. Revisá tu conexión.')
    }
  })

  const alInsertarMensaje = useEffectEvent((fila: MensajeFila) => {
    setPublicaciones((feed) => aplicarInsercionMensaje(feed, fila))
    if (!perfiles[fila.autor_id]) void recargarPerfiles()
  })

  // Suscripción a Postgres Changes (spec §7).
  useEffect(() => {
    const supabase = crearClienteNavegador()
    let cancelado = false
    let reintento: ReturnType<typeof setTimeout> | undefined
    let canal: RealtimeChannel | undefined

    async function suscribir() {
      // El join del canal se arma al llamar a subscribe() y lleva el token que Realtime tenga en ese momento.
      // Sin esperar a la sesión sale solo con la llave pública (rol anon): RLS no deja ver las filas y los
      // eventos llegan vacíos ("Error 401"). setAuth() sin argumento toma el token de la sesión actual.
      try {
        await supabase.realtime.setAuth()
      } catch {
        // Sin token no llegarían eventos: se reintenta igual que con un canal cerrado.
        if (cancelado) return
        huboCaida.current = true
        setConexion('reconectando')
        reintento = setTimeout(() => setIntentoCanal((n) => n + 1), 3000)
        return
      }
      if (cancelado) return

      canal = supabase
        // wait: SUBSCRIBED llega recién cuando el servidor confirma la suscripción a Postgres Changes,
        // así "en-vivo" garantiza que ya no se pierden eventos.
        .channel(`mensajes-${Math.random().toString(36).slice(2)}`, {
          config: { postgres_changes_options: { wait: true } },
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, (payload) => {
          alInsertarMensaje(payload.new as MensajeFila)
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'mensajes' }, (payload) => {
          const { id } = payload.old as Partial<MensajeFila>
          if (id) setPublicaciones((feed) => aplicarBorradoMensaje(feed, id))
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reacciones' }, (payload) => {
          const { mensaje_id, usuario_id } = payload.new as ReaccionFila
          setPublicaciones((feed) => fijarReaccion(feed, mensaje_id, usuario_id, true))
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'reacciones' }, (payload) => {
          const { mensaje_id, usuario_id } = payload.old as Partial<ReaccionFila>
          if (mensaje_id && usuario_id) setPublicaciones((feed) => fijarReaccion(feed, mensaje_id, usuario_id, false))
        })
        .subscribe((estado) => {
          if (cancelado) return
          if (estado === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
            setConexion('en-vivo')
            if (huboCaida.current) {
              huboCaida.current = false
              void recargarTodo()
            }
            return
          }
          // CHANNEL_ERROR y TIMED_OUT: el cliente reintenta solo. CLOSED: se crea un canal nuevo.
          huboCaida.current = true
          setConexion('reconectando')
          if (estado === REALTIME_SUBSCRIBE_STATES.CLOSED) {
            clearTimeout(reintento)
            reintento = setTimeout(() => setIntentoCanal((n) => n + 1), 3000)
          }
        })
    }
    void suscribir()

    return () => {
      cancelado = true
      clearTimeout(reintento)
      if (canal) void supabase.removeChannel(canal)
    }
  }, [intentoCanal])

  function agregarPropio(id: string, texto: string, padreId: string | null) {
    const fila: MensajeFila = { id, autor_id: usuario.id, padre_id: padreId, texto, creado_en: new Date().toISOString() }
    setPublicaciones((feed) => aplicarInsercionMensaje(feed, fila))
  }

  async function reaccionar(mensajeId: string) {
    const { feed, presente } = alternarReaccionLocal(publicaciones, mensajeId, usuario.id)
    setPublicaciones(feed)
    let error: string | null = null
    try {
      const resultado = await alternarReaccion({ mensajeId, presente })
      if (!resultado.ok) error = resultado.error
    } catch {
      error = 'No se pudo guardar tu reacción. Revisá tu conexión.'
    }
    if (error) {
      setPublicaciones((actual) => fijarReaccion(actual, mensajeId, usuario.id, !presente))
      aviso(error)
    }
  }

  function verAnteriores() {
    const antesDe = cursorAnteriores(publicaciones)
    iniciarCargaAnteriores(async () => {
      const resultado = await cargarMensajes({ antesDe })
      if (!resultado.ok) {
        aviso(resultado.error)
        return
      }
      setPublicaciones((feed) => agregarAnteriores(feed, resultado.data.publicaciones))
      setHayMas(resultado.data.hayMas)
    })
  }

  function confirmarBorrado() {
    if (!pedidoBorrado) return
    const { id } = pedidoBorrado
    iniciarBorrado(async () => {
      const resultado = await borrarMensaje({ id })
      setPedidoBorrado(null)
      if (!resultado.ok) {
        aviso(resultado.error)
        return
      }
      setPublicaciones((feed) => aplicarBorradoMensaje(feed, id))
      aviso('Mensaje eliminado.')
    })
  }

  return (
    <div className="feed-mensajes" data-conexion={conexion}>
      <FormularioPublicar alPublicar={(id, texto) => agregarPropio(id, texto, null)} />

      <div role="status" aria-live="polite" style={{ marginBottom: conexion === 'reconectando' ? 12 : 0 }}>
        {conexion === 'reconectando' && <span className="role-pill">Reconectando…</span>}
      </div>

      <div className="feed">
        {publicaciones.length === 0 ? (
          <div className="empty-state">Todavía no hay publicaciones. Sé el primero en escribir algo.</div>
        ) : (
          publicaciones.map((p) => (
            <TarjetaMensaje
              key={p.id}
              publicacion={p}
              perfiles={perfiles}
              usuario={usuario}
              ahora={ahora}
              alReaccionar={(mensajeId) => void reaccionar(mensajeId)}
              alResponder={(padreId, id, texto) => agregarPropio(id, texto, padreId)}
              alPedirBorrado={setPedidoBorrado}
            />
          ))
        )}
      </div>

      {hayMas && (
        <div className="compose-foot" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button type="button" className="btn ghost small" onClick={verAnteriores} disabled={cargandoAnteriores}>
            {cargandoAnteriores ? 'Cargando…' : 'Ver anteriores'}
          </button>
        </div>
      )}

      <ConfirmarBorrado
        pedido={pedidoBorrado}
        nombreAutor={pedidoBorrado ? (perfiles[pedidoBorrado.autorId]?.nombre ?? 'otra persona') : ''}
        esPropio={pedidoBorrado?.autorId === usuario.id}
        pendiente={borrando}
        alConfirmar={confirmarBorrado}
        alCerrar={() => setPedidoBorrado(null)}
      />
    </div>
  )
}
