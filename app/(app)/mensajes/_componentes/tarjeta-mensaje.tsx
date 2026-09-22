'use client'

import { useState } from 'react'
import type { EstadoMensaje, Publicacion, Respuesta } from '@/lib/mensajes/feed'
import { fechaHoraLocal, haceCuanto } from '@/lib/mensajes/tiempo'
import type { PerfilResumen } from '@/lib/perfiles/consultas'
import { ETIQUETA_ROL, type Rol } from '@/lib/perfiles/roles'
import { FormularioEditarPropio } from './formulario-editar-propio'
import { FormularioRespuesta } from './formulario-respuesta'

export type UsuarioFeed = { id: string; rol: Rol }
export type PedidoBorrado = { id: string; autorId: string; esRespuesta: boolean; respuestas: number }

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
}: {
  publicacion: Publicacion
  perfiles: Record<string, PerfilResumen>
  usuario: UsuarioFeed
  ahora: Date
  alReaccionar: (mensajeId: string) => void
  alResponder: (padreId: string, id: string, texto: string) => void
  alPedirBorrado: (pedido: PedidoBorrado) => void
}) {
  const [respondiendo, setRespondiendo] = useState(false)
  const autor = perfiles[publicacion.autorId]
  const reaccione = publicacion.reacciones.includes(usuario.id)

  return (
    <article className="msg" data-mensaje-id={publicacion.id}>
      <div className="msg-top">
        <div className="avatar">{autor?.siglas ?? '…'}</div>
        <div className="msg-body">
          <div className="msg-meta">
            <NombreDeAutor autor={autor} />
            {autor && <span className="role-pill">{ETIQUETA_ROL[autor.rol]}</span>}
            <Tiempo creadoEn={publicacion.creadoEn} ahora={ahora} />
          </div>
          <InsigniaEstado estado={publicacion.estado} motivoRechazo={publicacion.motivoRechazo} />
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
          </div>

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
