'use client'

import { useRef, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Icono } from '@/components/ui/iconos'
import { Modal } from '@/components/ui/modal'
import { fallo } from '@/lib/acciones/resultado'
import type { DiaConEtiqueta } from '@/lib/calendario/cuadricula'
import type { Evento } from '@/lib/calendario/tipos'
import { horaHHMM } from '@/lib/fechas'
import { eliminarEvento } from '../acciones'
import { EnlaceCenaExtra } from './enlace-cena-extra'
import { FormularioEditarEvento, FormularioNuevoEvento } from './formulario-evento'
import { InsigniasEvento } from './insignias-evento'

function FilaEvento({
  evento,
  puedeEditar,
  alEditar,
  enfocarDialogo,
}: {
  evento: Evento
  puedeEditar: boolean
  alEditar: () => void
  enfocarDialogo: () => void
}) {
  const aviso = useAviso()
  const [confirmando, setConfirmando] = useState(false)
  const [pendiente, iniciar] = useTransition()

  function cancelarEliminacion() {
    // El botón con foco desaparece: el foco vuelve al diálogo en vez de perderse en <body>.
    enfocarDialogo()
    setConfirmando(false)
  }

  function eliminar() {
    iniciar(async () => {
      let resultado
      try {
        resultado = await eliminarEvento({ id: evento.id })
      } catch {
        resultado = fallo('No se pudo eliminar el evento. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) {
        aviso('Evento eliminado.')
        enfocarDialogo()
      } else {
        aviso(resultado.error)
        cancelarEliminacion()
      }
    })
  }

  return (
    <div className="cal-evento-fila">
      <div className="cal-evento-texto">
        {evento.hora && <b>{horaHHMM(evento.hora)}</b>} <span>{evento.titulo}</span>
        <InsigniasEvento evento={evento} />
      </div>
      {puedeEditar && (
        <div className="cal-evento-acciones">
          {confirmando ? (
            <>
              <button type="button" className="btn danger small" onClick={eliminar} disabled={pendiente}>
                {pendiente ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
              {/* Al pedir confirmación el foco va a la opción segura. */}
              <button
                type="button"
                className="btn ghost small"
                onClick={cancelarEliminacion}
                disabled={pendiente}
                autoFocus
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button type="button" className="link-btn" onClick={alEditar} aria-label={`Editar ${evento.titulo}`}>
                Editar
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => setConfirmando(true)}
                aria-label={`Eliminar ${evento.titulo}`}
              >
                Eliminar
              </button>
              <EnlaceCenaExtra eventoId={evento.id} />
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
  paraCocina,
  ausente = false,
  alCerrar,
}: {
  dia: DiaConEtiqueta
  eventos: Evento[]
  puedeEditar: boolean
  /** Administración: la lista es lo que debe preparar la cocina, no los eventos de la casa. */
  paraCocina: boolean
  /** La persona marcó que no estará ese día (solo Director y Residente la conocen). */
  ausente?: boolean
  alCerrar: () => void
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const editando = puedeEditar && eventos.some((e) => e.id === editandoId)
  const lista = useRef<HTMLDivElement>(null)

  /**
   * Lleva el foco al contenedor del diálogo (Modal le pone tabIndex=-1) cuando el control que lo tenía
   * desaparece: al cancelar o guardar una edición y al eliminar. Si el modal ya se cerró, no hace nada.
   */
  function enfocarDialogo() {
    lista.current?.closest<HTMLElement>('[role="dialog"]')?.focus()
  }

  function terminarEdicion() {
    enfocarDialogo()
    setEditandoId(null)
  }

  return (
    <Modal titulo={dia.etiqueta} abierto alCerrar={alCerrar} enfocarDialogo>
      {ausente && (
        <div className="aviso-ausente">
          <Icono nombre="ausencia" />
          <span>Marcaste que no vas a estar este día. Tus comidas están canceladas.</span>
        </div>
      )}
      <div ref={lista} className="cal-evento-lista">
        {eventos.length === 0 ? (
          <div className="empty-state">
            {paraCocina ? 'No hay nada para la cocina este día.' : 'No hay eventos este día.'}
          </div>
        ) : (
          eventos.map((evento) =>
            editando && evento.id === editandoId ? (
              <FormularioEditarEvento key={evento.id} evento={evento} alTerminar={terminarEdicion} />
            ) : (
              <FilaEvento
                key={evento.id}
                evento={evento}
                puedeEditar={puedeEditar}
                alEditar={() => setEditandoId(evento.id)}
                enfocarDialogo={enfocarDialogo}
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
