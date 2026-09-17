'use client'

import { useState } from 'react'
import type { Publicacion, Respuesta } from '@/lib/mensajes/feed'
import { fechaHoraLocal, haceCuanto } from '@/lib/mensajes/tiempo'
import type { PerfilResumen } from '@/lib/perfiles/consultas'
import { ETIQUETA_ROL, type Rol } from '@/lib/perfiles/roles'
import { FormularioRespuesta } from './formulario-respuesta'

export type UsuarioFeed = { id: string; rol: Rol }
export type PedidoBorrado = { id: string; autorId: string; esRespuesta: boolean; respuestas: number }

function puedeBorrar(autorId: string, usuario: UsuarioFeed) {
  return autorId === usuario.id || usuario.rol === 'director'
}

function Tiempo({ creadoEn, ahora }: { creadoEn: string; ahora: Date }) {
  return (
    <time className="time" dateTime={creadoEn} title={fechaHoraLocal(creadoEn)}>
      {haceCuanto(creadoEn, ahora)}
    </time>
  )
}

function NodoRespuesta({
  respuesta,
  autor,
  puedeEliminar,
  ahora,
  alEliminar,
}: {
  respuesta: Respuesta
  autor: PerfilResumen | undefined
  puedeEliminar: boolean
  ahora: Date
  alEliminar: () => void
}) {
  return (
    <div className="msg-top">
      <div className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>
        {autor?.siglas ?? '…'}
      </div>
      <div className="msg-body">
        <div className="msg-meta">
          <span className="name" style={{ fontSize: 12.5 }}>
            {autor?.nombre ?? 'Cargando…'}
          </span>
          <Tiempo creadoEn={respuesta.creadoEn} ahora={ahora} />
        </div>
        <div className="msg-text" style={{ fontSize: 13 }}>
          {respuesta.texto}
        </div>
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
            <span className="name">{autor?.nombre ?? 'Cargando…'}</span>
            {autor && <span className="role-pill">{ETIQUETA_ROL[autor.rol]}</span>}
            <Tiempo creadoEn={publicacion.creadoEn} ahora={ahora} />
          </div>
          <div className="msg-text">{publicacion.texto}</div>
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
