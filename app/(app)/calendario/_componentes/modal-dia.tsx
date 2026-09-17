'use client'

import { useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Modal } from '@/components/ui/modal'
import type { DiaConEtiqueta } from '@/lib/calendario/cuadricula'
import type { Evento } from '@/lib/calendario/tipos'
import { horaHHMM } from '@/lib/fechas'
import { eliminarEvento } from '../acciones'
import { FormularioEditarEvento, FormularioNuevoEvento } from './formulario-evento'

function FilaEvento({
  evento,
  puedeEditar,
  alEditar,
}: {
  evento: Evento
  puedeEditar: boolean
  alEditar: () => void
}) {
  const aviso = useAviso()
  const [confirmando, setConfirmando] = useState(false)
  const [pendiente, iniciar] = useTransition()

  function eliminar() {
    iniciar(async () => {
      const resultado = await eliminarEvento({ id: evento.id })
      if (resultado.ok) {
        aviso('Evento eliminado.')
      } else {
        aviso(resultado.error)
        setConfirmando(false)
      }
    })
  }

  return (
    <div className="cal-evento-fila">
      <div className="cal-evento-texto">
        {evento.hora && <b>{horaHHMM(evento.hora)}</b>} <span>{evento.titulo}</span>
      </div>
      {puedeEditar && (
        <div className="cal-evento-acciones">
          {confirmando ? (
            <>
              <button type="button" className="btn danger small" onClick={eliminar} disabled={pendiente}>
                {pendiente ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
              <button type="button" className="btn ghost small" onClick={() => setConfirmando(false)} disabled={pendiente}>
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button type="button" className="link-btn" onClick={alEditar}>
                Editar
              </button>
              <button type="button" className="link-btn" onClick={() => setConfirmando(true)}>
                Eliminar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Modal de un día. Director: lista con editar/eliminar + formulario de alta.
 * Residente y Administración: solo la lista (spec §5.1).
 */
export function ModalDia({
  dia,
  eventos,
  puedeEditar,
  alCerrar,
}: {
  dia: DiaConEtiqueta
  eventos: Evento[]
  puedeEditar: boolean
  alCerrar: () => void
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const editando = puedeEditar && eventos.some((e) => e.id === editandoId)

  return (
    <Modal titulo={dia.etiqueta} abierto alCerrar={alCerrar}>
      <div className="cal-evento-lista">
        {eventos.length === 0 ? (
          <div className="empty-state">No hay eventos este día.</div>
        ) : (
          eventos.map((evento) =>
            editando && evento.id === editandoId ? (
              <FormularioEditarEvento key={evento.id} evento={evento} alTerminar={() => setEditandoId(null)} />
            ) : (
              <FilaEvento
                key={evento.id}
                evento={evento}
                puedeEditar={puedeEditar}
                alEditar={() => setEditandoId(evento.id)}
              />
            ),
          )
        )}
      </div>
      {puedeEditar && !editando ? (
        <FormularioNuevoEvento fecha={dia.fecha} alCerrar={alCerrar} />
      ) : (
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={alCerrar}>
            Cerrar
          </button>
        </div>
      )}
    </Modal>
  )
}
