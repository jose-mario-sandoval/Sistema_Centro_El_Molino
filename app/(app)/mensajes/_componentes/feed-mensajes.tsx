'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import type { PaginaFeed } from '@/lib/mensajes/consulta-feed'
import {
  agregarAnteriores,
  aplicarBorradoMensaje,
  aplicarInsercionMensaje,
  cursorAnteriores,
  fijarReaccion,
  tieneReaccion,
  type MensajeFila,
} from '@/lib/mensajes/feed'
import { aplicarCambios, type CambioFeed, type EventoLeido } from '@/lib/mensajes/tiempo-real'
import type { PerfilResumen } from '@/lib/perfiles/consultas'
import { alternarReaccion, borrarMensaje, cargarMensajes, cargarPerfiles } from '../acciones'
import { ConfirmarBorrado } from './confirmar-borrado'
import { FormularioPublicar } from './formulario-publicar'
import { TarjetaMensaje, type PedidoBorrado, type UsuarioFeed } from './tarjeta-mensaje'
import { useCanalMensajes, type ResultadoRecarga } from './use-canal-mensajes'

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
  const [ahora, setAhora] = useState(() => new Date(generadoEn))
  const [pedidoBorrado, setPedidoBorrado] = useState<PedidoBorrado | null>(null)
  const [borrando, iniciarBorrado] = useTransition()
  const [cargandoAnteriores, iniciarCargaAnteriores] = useTransition()
  const recargandoPerfiles = useRef(false)
  /** Sube al empezar y al terminar cada recarga completa: invalida un "Ver anteriores" pedido sobre el feed viejo. */
  const generacion = useRef(0)
  /** Cambios (eventos y optimistas) llegados durante una recarga completa; null si no hay recarga en curso. */
  const cambiosEnRecarga = useRef<CambioFeed[] | null>(null)
  const avisoRecargaMostrado = useRef(false)

  // "hace cuánto" se actualiza cada minuto.
  useEffect(() => {
    const reloj = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(reloj)
  }, [])

  /** Todo cambio local del feed pasa por acá, para no perderlo si una recarga en curso reemplaza los datos. */
  function aplicar(cambio: CambioFeed) {
    cambiosEnRecarga.current?.push(cambio)
    setPublicaciones(cambio)
  }

  async function recargarPerfiles() {
    if (recargandoPerfiles.current) return
    recargandoPerfiles.current = true
    const resultado = await llamarAccion(cargarPerfiles)
    recargandoPerfiles.current = false
    if (resultado.ok) setPerfiles(indexar(resultado.data))
  }

  async function recargarTodo(): Promise<ResultadoRecarga> {
    const esta = ++generacion.current
    cambiosEnRecarga.current ??= []
    const [mensajes, listaPerfiles] = await Promise.all([
      llamarAccion(() => cargarMensajes({ antesDe: null })),
      llamarAccion(cargarPerfiles),
    ])
    // Empezó otra recarga: esa se queda con los cambios acumulados y aplica sus datos, más nuevos.
    if (esta !== generacion.current) return 'descartada'

    if (listaPerfiles.ok) setPerfiles(indexar(listaPerfiles.data))
    const cambios = cambiosEnRecarga.current ?? []
    cambiosEnRecarga.current = null
    if (!mensajes.ok) {
      // Los cambios ya están aplicados sobre el feed actual; el indicador sigue en "Reconectando…" y se reintenta.
      if (!avisoRecargaMostrado.current) aviso(mensajes.error)
      avisoRecargaMostrado.current = true
      return 'fallo'
    }
    avisoRecargaMostrado.current = false
    generacion.current++
    // Los cambios son idempotentes: lo que la recarga ya trae no se duplica.
    setPublicaciones(aplicarCambios(mensajes.data.publicaciones, cambios))
    setHayMas(mensajes.data.hayMas)
    return 'ok'
  }

  function alEvento({ cambio, autorId }: EventoLeido) {
    aplicar(cambio)
    if (autorId && !perfiles[autorId]) void recargarPerfiles()
  }

  const conexion = useCanalMensajes({ alEvento, recargar: recargarTodo })

  function agregarPropio(id: string, texto: string, padreId: string | null) {
    const fila: MensajeFila = { id, autor_id: usuario.id, padre_id: padreId, texto, creado_en: new Date().toISOString() }
    aplicar((feed) => aplicarInsercionMensaje(feed, fila))
  }

  async function reaccionar(mensajeId: string) {
    // Estado final fijo (no "alternar") para que el cambio sea idempotente si se vuelve a aplicar.
    const presente = !tieneReaccion(publicaciones, mensajeId, usuario.id)
    aplicar((feed) => fijarReaccion(feed, mensajeId, usuario.id, presente))
    const resultado = await llamarAccion(() => alternarReaccion({ mensajeId, presente }))
    if (!resultado.ok) {
      aplicar((feed) => fijarReaccion(feed, mensajeId, usuario.id, !presente))
      aviso(resultado.error)
    }
  }

  function verAnteriores() {
    const antesDe = cursorAnteriores(publicaciones)
    const generacionPedida = generacion.current
    iniciarCargaAnteriores(async () => {
      const resultado = await llamarAccion(() => cargarMensajes({ antesDe }))
      // Una recarga completa reemplazó el feed mientras tanto: el cursor ya no corresponde y quedaría un hueco.
      if (generacionPedida !== generacion.current) return
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
      const resultado = await llamarAccion(() => borrarMensaje({ id }))
      // Con Escape se puede cerrar el diálogo y abrir otro mientras tanto: ese no se toca.
      setPedidoBorrado((actual) => (actual?.id === id ? null : actual))
      if (!resultado.ok) {
        aviso(resultado.error)
        return
      }
      aplicar((feed) => aplicarBorradoMensaje(feed, id))
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
