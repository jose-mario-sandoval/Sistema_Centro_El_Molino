'use client'

import { useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import type { MensajeFila } from '@/lib/mensajes/feed'
import type { PerfilResumen } from '@/lib/perfiles/consultas'
import { moderarMensaje } from '../acciones'

function FilaPendiente({ mensaje, autor }: { mensaje: MensajeFila; autor: PerfilResumen | undefined }) {
  const aviso = useAviso()
  const [texto, setTexto] = useState(mensaje.texto)
  const [motivo, setMotivo] = useState('')
  const [pendiente, iniciar] = useTransition()

  function moderar(estado: 'aprobado' | 'rechazado') {
    iniciar(async () => {
      const resultado = await llamarAccion(() =>
        moderarMensaje({
          id: mensaje.id,
          estado,
          texto: texto !== mensaje.texto ? texto : undefined,
          motivoRechazo: motivo || undefined,
        }),
      )
      if (resultado.ok) aviso(estado === 'aprobado' ? 'Mensaje aprobado.' : 'Mensaje rechazado.')
      else aviso(resultado.error)
    })
  }

  return (
    <div className="card pendiente-item">
      <div className="msg-meta">
        {autor?.siglas ?? '…'} · {mensaje.padre_id ? 'Respuesta' : 'Publicación'}
      </div>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} />
      <div className="field">
        <label htmlFor={`motivo-${mensaje.id}`}>Motivo del rechazo (opcional)</label>
        <input id={`motivo-${mensaje.id}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </div>
      <div className="modal-foot">
        <button type="button" className="btn ghost small" onClick={() => moderar('rechazado')} disabled={pendiente}>
          Rechazar
        </button>
        <button type="button" className="btn small" onClick={() => moderar('aprobado')} disabled={pendiente}>
          Aprobar
        </button>
      </div>
    </div>
  )
}

export function ColaModeracion({ mensajes, perfiles }: { mensajes: MensajeFila[]; perfiles: PerfilResumen[] }) {
  const porId = Object.fromEntries(perfiles.map((p) => [p.id, p]))
  if (mensajes.length === 0) return <div className="empty-state">No hay mensajes pendientes de aprobación.</div>
  return (
    <div className="lista-pendientes">
      {mensajes.map((m) => (
        <FilaPendiente key={m.id} mensaje={m} autor={porId[m.autor_id]} />
      ))}
    </div>
  )
}
