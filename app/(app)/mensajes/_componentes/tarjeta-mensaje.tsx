'use client'

import { useId, useRef, useState } from 'react'
import { Icono } from '@/components/ui/iconos'
import type { Resultado } from '@/lib/acciones/resultado'
import type { DatosFijado, EstadoMensaje, Publicacion, Respuesta } from '@/lib/mensajes/feed'
import { estaFijada, puedeFijar, textoFijado, type DuracionFijado } from '@/lib/mensajes/fijados'
import { fechaHoraLocal, haceCuanto } from '@/lib/mensajes/tiempo'
import type { PerfilResumen } from '@/lib/perfiles/consultas'
import { ETIQUETA_ROL, type Rol } from '@/lib/perfiles/roles'
import { FormularioEditarPropio } from './formulario-editar-propio'
import { FormularioRespuesta } from './formulario-respuesta'
import { PanelFijar } from './panel-fijar'

export type UsuarioFeed = { id: string; rol: Rol }
export type PedidoBorrado = { id: string; autorId: string; esRespuesta: boolean; respuestas: number }
export type AlFijar = (id: string, duracion: DuracionFijado, fecha?: string) => Promise<Resultado<DatosFijado>>

function puedeBorrar(autorId: string, usuario: UsuarioFeed) {
  return autorId === usuario.id || usuario.rol === 'director'
}

function InsigniaEstado({ estado, motivoRechazo }: { estado: EstadoMensaje; motivoRechazo: string | null }) {
  if (estado === 'aprobado') return null
  if (estado === 'pendiente') return <span className="badge pendiente">Esperando aprobación</span>
  return <span className="badge rechazado">Rechazado{motivoRechazo ? `: ${motivoRechazo}` : ''}</span>
}

function Tiempo({ creadoEn, ahora }: { creadoEn: string; ahora: Date }) {
  return (
    <time className="time" dateTime={creadoEn} title={fechaHoraLocal(creadoEn)}>
      {haceCuanto(creadoEn, ahora)}
    </time>
  )
}

/**
 * Administración ve siglas en lugar del nombre (lib/perfiles/visibilidad.ts): entonces `nombre` y
 * `siglas` son lo mismo, y repetirlas al lado del avatar sería ruido. El avatar ya las lleva.
 */
function NombreDeAutor({ autor }: { autor: PerfilResumen | undefined }) {
  if (!autor) return <span className="name">Cargando…</span>
  if (autor.nombre === autor.siglas) return null
  return <span className="name">{autor.nombre}</span>
}

function NodoRespuesta({
  respuesta,
  autor,
  usuario,
  puedeEliminar,
  ahora,
  alEliminar,
}: {
  respuesta: Respuesta
  autor: PerfilResumen | undefined
  usuario: UsuarioFeed
  puedeEliminar: boolean
  ahora: Date
  alEliminar: () => void
}) {
  return (
    <div className="msg-top">
      <div className="avatar">
        {autor?.siglas ?? '…'}
      </div>
      <div className="msg-body">
        <div className="msg-meta">
          <NombreDeAutor autor={autor} />
          <Tiempo creadoEn={respuesta.creadoEn} ahora={ahora} />
        </div>
        <InsigniaEstado estado={respuesta.estado} motivoRechazo={respuesta.motivoRechazo} />
        <div className="msg-text">{respuesta.texto}</div>
        {respuesta.estado === 'rechazado' && respuesta.autorId === usuario.id && (
          <FormularioEditarPropio id={respuesta.id} textoActual={respuesta.texto} />
        )}
        {puedeEliminar && (
          <div className="msg-actions">
            <button type="button" className="msg-action delete" onClick={alEliminar}>
              Eliminar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function TarjetaMensaje({
  publicacion,
  perfiles,
  usuario,
  ahora,
  alReaccionar,
  alResponder,
  alPedirBorrado,
  alFijar,
  alDesfijar,
}: {
  publicacion: Publicacion
  perfiles: Record<string, PerfilResumen>
  usuario: UsuarioFeed
  ahora: Date
  alReaccionar: (mensajeId: string) => void
  alResponder: (padreId: string, id: string, texto: string) => void
  alPedirBorrado: (pedido: PedidoBorrado) => void
  alFijar: AlFijar
  alDesfijar: (id: string) => Promise<void>
}) {
  const [respondiendo, setRespondiendo] = useState(false)
  const [fijando, setFijando] = useState(false)
  const [quitando, setQuitando] = useState(false)
  const botonFijar = useRef<HTMLButtonElement>(null)
  const idPanel = useId()
  const autor = perfiles[publicacion.autorId]
  const reaccione = publicacion.reacciones.includes(usuario.id)
  const fijada = estaFijada(publicacion, ahora)
  // Solo publicaciones aprobadas; TarjetaMensaje es siempre una publicación (las respuestas son NodoRespuesta).
  const mostrarFijar = puedeFijar(usuario.rol) && publicacion.estado === 'aprobado'
  // Quién la fijó, por rol: Administración no conoce nombres (y el Director tampoco los necesita acá).
  const rolFijador = publicacion.fijadoPor ? perfiles[publicacion.fijadoPor]?.rol : null

  function cerrarPanel() {
    setFijando(false)
    botonFijar.current?.focus()
  }

  async function quitar() {
    if (quitando) return
    setQuitando(true)
    await alDesfijar(publicacion.id)
    setQuitando(false)
  }

  return (
    <article className="msg" data-mensaje-id={publicacion.id} tabIndex={-1}>
      <div className="msg-top">
        <div className="avatar">{autor?.siglas ?? '…'}</div>
        <div className="msg-body">
          <div className="msg-meta">
            <NombreDeAutor autor={autor} />
            {autor && <span className="role-pill">{ETIQUETA_ROL[autor.rol]}</span>}
            <Tiempo creadoEn={publicacion.creadoEn} ahora={ahora} />
          </div>
          <InsigniaEstado estado={publicacion.estado} motivoRechazo={publicacion.motivoRechazo} />
          {fijada && (
            <div className="insignia-fijado">
              <Icono nombre="fijar" />
              <span>{textoFijado(publicacion.fijadoHasta, rolFijador)}</span>
            </div>
          )}
          <div className="msg-text">{publicacion.texto}</div>
          {publicacion.estado === 'rechazado' && publicacion.autorId === usuario.id && (
            <FormularioEditarPropio id={publicacion.id} textoActual={publicacion.texto} />
          )}
          <div className="msg-actions">
            <button
              type="button"
              className={`msg-action${reaccione ? ' liked' : ''}`}
              aria-pressed={reaccione}
              aria-label={`Me gusta (${publicacion.reacciones.length})`}
              onClick={() => alReaccionar(publicacion.id)}
            >
              👍 <span>{publicacion.reacciones.length}</span>
            </button>
            <button
              type="button"
              className="msg-action"
              aria-expanded={respondiendo}
              onClick={() => setRespondiendo((abierto) => !abierto)}
            >
              Responder
            </button>
            {puedeBorrar(publicacion.autorId, usuario) && (
              <button
                type="button"
                className="msg-action delete"
                onClick={() =>
                  alPedirBorrado({
                    id: publicacion.id,
                    autorId: publicacion.autorId,
                    esRespuesta: false,
                    respuestas: publicacion.respuestas.length,
                  })
                }
              >
                Eliminar
              </button>
            )}
            {mostrarFijar &&
              (fijada ? (
                <button
                  type="button"
                  className="msg-action"
                  onClick={() => void quitar()}
                  aria-disabled={quitando}
                  aria-busy={quitando}
                >
                  <Icono nombre="fijar" />
                  {quitando ? 'Quitando…' : 'Quitar de fijados'}
                </button>
              ) : (
                <button
                  ref={botonFijar}
                  type="button"
                  className="msg-action"
                  aria-expanded={fijando}
                  aria-controls={fijando ? idPanel : undefined}
                  onClick={() => (fijando ? cerrarPanel() : setFijando(true))}
                >
                  <Icono nombre="fijar" />
                  Fijar
                </button>
              ))}
          </div>

          {fijando && !fijada && (
            <PanelFijar
              id={idPanel}
              mensajeId={publicacion.id}
              ahora={ahora}
              alFijar={alFijar}
              alCancelar={cerrarPanel}
            />
          )}

          {publicacion.respuestas.length > 0 && (
            <div className="thread">
              {publicacion.respuestas.map((r) => (
                <NodoRespuesta
                  key={r.id}
                  respuesta={r}
                  autor={perfiles[r.autorId]}
                  usuario={usuario}
                  puedeEliminar={puedeBorrar(r.autorId, usuario)}
                  ahora={ahora}
                  alEliminar={() => alPedirBorrado({ id: r.id, autorId: r.autorId, esRespuesta: true, respuestas: 0 })}
                />
              ))}
            </div>
          )}

          {respondiendo && (
            <FormularioRespuesta
              padreId={publicacion.id}
              alResponder={(id, texto) => {
                alResponder(publicacion.id, id, texto)
                setRespondiendo(false)
              }}
            />
          )}
        </div>
      </div>
    </article>
  )
}
