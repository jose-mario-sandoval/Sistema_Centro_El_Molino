'use client'

import { useRef, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Icono } from '@/components/ui/iconos'
import { Modal } from '@/components/ui/modal'
import { fallo } from '@/lib/acciones/resultado'
import type { DiaConEtiqueta } from '@/lib/calendario/cuadricula'
import { eventosDelDia, filtroQueOculta, textoMostrarFiltro, type Filtro } from '@/lib/calendario/filtros'
import type { Evento } from '@/lib/calendario/tipos'
import { horaHHMM } from '@/lib/fechas'
import { eliminarEvento, eliminarSerieDesdeHoy } from '../acciones'
import { EnlaceCenaExtra } from './enlace-cena-extra'
import { FormularioEditarEvento, FormularioNuevoEvento } from './formulario-evento'
import { InsigniasEvento } from './insignias-evento'

function FilaEvento({
  evento,
  ocultoPor,
  alMostrarFiltro,
  puedeEditar,
  alEditar,
  enfocarDialogo,
}: {
  evento: Evento
  /**
   * El filtro que lo esconde del calendario (null si se ve): está en la lista porque se pidió
   * "Mostrarlos" o porque se acaba de agregar o editar acá.
   */
  ocultoPor: Filtro | null
  /** Vuelve a mostrar en el calendario lo que esconde ese filtro. */
  alMostrarFiltro?: (filtro: Filtro) => void
  puedeEditar: boolean
  alEditar: () => void
  enfocarDialogo: () => void
}) {
  const aviso = useAviso()
  const [confirmando, setConfirmando] = useState(false)
  const [confirmandoSerie, setConfirmandoSerie] = useState(false)
  const [pendiente, iniciar] = useTransition()

  function cancelarEliminacion() {
    // El botón con foco desaparece: el foco vuelve al diálogo en vez de perderse en <body>.
    enfocarDialogo()
    setConfirmando(false)
  }

  function cancelarCancelacionSerie() {
    enfocarDialogo()
    setConfirmandoSerie(false)
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

  function cancelarSerie() {
    iniciar(async () => {
      let resultado
      try {
        resultado = await eliminarSerieDesdeHoy({ serie_id: evento.serie_id })
      } catch {
        resultado = fallo('No se pudo cancelar la serie. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) {
        aviso(`Se cancelaron ${resultado.data.cantidad} eventos futuros de la serie.`)
        enfocarDialogo()
      } else {
        aviso(resultado.error)
        cancelarCancelacionSerie()
      }
    })
  }

  return (
    <div className="cal-evento-fila">
      <div className="cal-evento-texto">
        {evento.hora && <b>{horaHHMM(evento.hora)}</b>} <span>{evento.titulo}</span>
        <InsigniasEvento evento={evento} oculto={ocultoPor !== null} />
        {ocultoPor !== null && alMostrarFiltro && (
          <button
            type="button"
            className="link-btn mostrar-filtro"
            onClick={() => {
              // El botón desaparece al verse el evento: el foco vuelve al diálogo, no a <body>.
              enfocarDialogo()
              alMostrarFiltro(ocultoPor)
            }}
          >
            {textoMostrarFiltro(ocultoPor)}
          </button>
        )}
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
          ) : confirmandoSerie ? (
            <>
              <button type="button" className="btn danger small" onClick={cancelarSerie} disabled={pendiente}>
                {pendiente ? 'Cancelando…' : 'Sí, cancelar la serie'}
              </button>
              <button
                type="button"
                className="btn ghost small"
                onClick={cancelarCancelacionSerie}
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
              {evento.serie_id && (
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setConfirmandoSerie(true)}
                  aria-label={`Cancelar toda la serie de ${evento.titulo}`}
                >
                  Cancelar toda la serie
                </button>
              )}
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
  ocultos = [],
  alMostrarFiltro,
  puedeEditar,
  paraCocina,
  ausente = false,
  alCerrar,
}: {
  dia: DiaConEtiqueta
  /** Todos los eventos del día; los filtros (`ocultos`) deciden cuáles se listan. */
  eventos: Evento[]
  ocultos?: readonly Filtro[]
  /** Vuelve a mostrar en el calendario lo que esconde un filtro (desde un evento oculto de la lista). */
  alMostrarFiltro?: (filtro: Filtro) => void
  puedeEditar: boolean
  /** Administración: la lista es lo que debe preparar la cocina, no los eventos de la casa. */
  paraCocina: boolean
  /** La persona marcó que no estará ese día (solo Director y Residente la conocen). */
  ausente?: boolean
  alCerrar: () => void
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null)
  // "Mostrarlos": los eventos ocultos por los filtros se ven en este día, sin cambiar los filtros.
  const [verOcultos, setVerOcultos] = useState(false)
  // Lo que se agrega o edita acá se ve en la lista aunque los filtros lo escondan (marcado como
  // oculto y con el aviso de por qué): si desapareciera, parecería que no se guardó y se cargaría dos veces.
  const [idsAlAbrir] = useState(() => new Set(eventos.map((e) => e.id)))
  const [editados, setEditados] = useState<ReadonlySet<string>>(() => new Set())
  const revelados = new Set([...eventos.filter((e) => !idsAlAbrir.has(e.id)).map((e) => e.id), ...editados])
  const { lista: aListar, ocultosSinMostrar } = eventosDelDia(eventos, ocultos, { verTodos: verOcultos, revelados })
  const editando = puedeEditar && aListar.some((e) => e.id === editandoId)
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
      {ocultosSinMostrar > 0 && (
        <div className="aviso-ocultos-dia">
          <Icono nombre="oculto" />
          <span>
            {ocultosSinMostrar === 1
              ? 'Hay 1 evento oculto por los filtros.'
              : `Hay ${ocultosSinMostrar} eventos ocultos por los filtros.`}
          </span>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              // El botón desaparece: el foco vuelve al diálogo, no a <body>.
              enfocarDialogo()
              setVerOcultos(true)
            }}
          >
            {ocultosSinMostrar === 1 ? 'Mostrarlo' : 'Mostrarlos'}
          </button>
        </div>
      )}
      <div ref={lista} className="cal-evento-lista">
        {aListar.length === 0 ? (
          <div className="empty-state">
            {paraCocina
              ? 'No hay nada para la cocina este día.'
              : ocultosSinMostrar > 0
                ? 'No hay eventos a la vista este día.'
                : 'No hay eventos este día.'}
          </div>
        ) : (
          aListar.map((evento) =>
            editando && evento.id === editandoId ? (
              <FormularioEditarEvento
                key={evento.id}
                evento={evento}
                ocultos={ocultos}
                alGuardar={() => setEditados((antes) => new Set(antes).add(evento.id))}
                alTerminar={terminarEdicion}
              />
            ) : (
              <FilaEvento
                key={evento.id}
                evento={evento}
                ocultoPor={filtroQueOculta(evento, ocultos)}
                alMostrarFiltro={alMostrarFiltro}
                puedeEditar={puedeEditar}
                alEditar={() => setEditandoId(evento.id)}
                enfocarDialogo={enfocarDialogo}
              />
            ),
          )
        )}
      </div>
      {puedeEditar && !editando ? (
        <FormularioNuevoEvento fecha={dia.fecha} ocultos={ocultos} alCerrar={alCerrar} />
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
