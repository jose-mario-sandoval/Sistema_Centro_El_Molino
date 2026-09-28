'use client'

import { useId, useRef, useState, type Ref } from 'react'
import { Icono } from '@/components/ui/iconos'
import { INFO_ESTADO, type EstadoComida } from '@/lib/comidas/tipos'
import { varsEstado } from './insignia-estado'
import { PanelOpciones, type MotivoCierre } from './panel-opciones'

/** El estado actual como botón grande (elevado = se toca). "Sin definir" es un hueco con la pregunta escrita. */
function BotonEstado({
  ref,
  estado,
  pregunta,
  editable,
  abierto,
  controla,
  alTocar,
}: {
  ref: Ref<HTMLButtonElement>
  estado: EstadoComida | null
  pregunta: string
  editable: boolean
  abierto: boolean
  controla?: string
  alTocar: () => void
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={`estado-actual${estado ? '' : ' sin-definir'}`}
      style={estado ? varsEstado(estado) : undefined}
      disabled={!editable}
      aria-expanded={editable ? abierto : undefined}
      aria-controls={controla}
      onClick={alTocar}
    >
      <Icono nombre={estado ?? 'sinDefinir'} />
      <span className="estado-actual-texto">{estado ? INFO_ESTADO[estado].etiqueta : pregunta}</span>
      {editable && (
        <>
          {/* El nombre accesible dice qué hace el botón, no solo qué muestra. */}
          <span className="sr-only">, cambiar</span>
          <Icono nombre="abajo" className="flecha" />
        </>
      )}
    </button>
  )
}

/**
 * Una comida de la Semana: el estado actual como botón y, al tocarlo, las seis opciones debajo
 * (`PanelOpciones`, la misma pieza que usa la cuadrícula del Plan: DESIGN.md §8). Solo pinta;
 * guardar es de quien lo usa.
 */
export function SelectorComida({
  nombre,
  estado,
  marcado,
  pregunta,
  origen,
  nota,
  cierre,
  cerrada,
  pendiente,
  editorAbierto,
  alElegir,
  alCerrar,
  editorNota,
  acciones,
  etiquetaGrupo,
}: {
  /** 'Almuerzo' */
  nombre: string
  /** Estado que rige hoy (null = sin definir). */
  estado: EstadoComida | null
  /** Opción hundida: puede adelantarse a `estado` mientras se escribe la nota. */
  marcado: EstadoComida | null
  /** Se muestra en lugar del estado cuando está sin definir. */
  pregunta: string
  /** 'según tu plan' / 'cambiada'. */
  origen?: { texto: string; cambiada: boolean } | null
  /** 'Hora: 13:30' */
  nota?: string | null
  /** 'Cierra hoy 10:00' */
  cierre?: string | null
  /** Motivo por el que ya no se puede cambiar; null = abierta. */
  cerrada?: string | null
  pendiente: boolean
  /** Hay una nota a medio escribir: las opciones quedan abiertas hasta guardarla o cancelarla. */
  editorAbierto: boolean
  alElegir: (estado: EstadoComida) => void
  /**
   * Al cerrar ("Listo", volver a tocar el estado, Escape): quien lo usa guarda o descarta lo que quedó
   * a medio escribir. Devolver false deja el panel abierto (la nota no sirve y el error está a la vista).
   */
  alCerrar?: (motivo: MotivoCierre) => boolean | void
  editorNota?: React.ReactNode
  acciones?: React.ReactNode
  /** Nombre del grupo de opciones si no sirve "Elegí qué hacés con …" (La casa: tercera persona). */
  etiquetaGrupo?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const idPanel = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const editable = !cerrada
  const visible = editable && (abierto || editorAbierto)

  function cerrar(motivo: MotivoCierre) {
    if (alCerrar?.(motivo) === false) return
    setAbierto(false)
    boton.current?.focus()
  }

  return (
    <>
      <div className="comida-fila-top">
        <span className="comida-nombre">{nombre}</span>
        {origen && <span className={`origen${origen.cambiada ? ' cambiada' : ''}`}>{origen.texto}</span>}
      </div>

      <BotonEstado
        ref={boton}
        estado={estado}
        pregunta={pregunta}
        editable={editable}
        abierto={visible}
        controla={visible ? idPanel : undefined}
        alTocar={() => (visible ? cerrar('listo') : setAbierto(true))}
      />

      {estado && nota && (
        <div className="nota-comida">
          <Icono nombre={estado} />
          <span>{nota}</span>
        </div>
      )}
      {cerrada ? (
        <div className="motivo-cierre">
          <Icono nombre="candado" />
          <span>{cerrada}</span>
        </div>
      ) : (
        cierre && <div className="detalle-cierre">{cierre}</div>
      )}

      {visible && (
        <PanelOpciones
          id={idPanel}
          nombre={nombre}
          etiquetaGrupo={etiquetaGrupo}
          marcado={marcado}
          pendiente={pendiente}
          alElegir={alElegir}
          alCerrar={cerrar}
          editorNota={editorNota}
          acciones={acciones}
        />
      )}
    </>
  )
}
