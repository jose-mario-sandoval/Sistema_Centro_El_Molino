'use client'

import { useId, useRef, useState } from 'react'
import { Icono } from '@/components/ui/iconos'
import { ESTADOS_COMIDA, INFO_ESTADO, type EstadoComida } from '@/lib/comidas/tipos'
import { varsEstado } from './insignia-estado'

/**
 * La única interacción de comidas (DESIGN.md §8): Plan semanal y Semana responden la misma
 * pregunta, así que usan este mismo componente. Solo pinta; guardar es de quien lo usa.
 *
 * Arriba, el estado actual como botón grande (elevado = se toca). Al tocarlo se abren las seis
 * opciones; la elegida queda hundida, con su color, su icono y el texto en negrita.
 * "Sin definir" no es texto gris: es un hueco con la pregunta escrita.
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
  /** Al tocar "Listo": quien lo usa descarta lo que quedó a medio escribir. */
  alCerrar?: () => void
  editorNota?: React.ReactNode
  acciones?: React.ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const idPanel = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const editable = !cerrada
  const visible = editable && (abierto || editorAbierto)

  function cerrar() {
    alCerrar?.()
    setAbierto(false)
    boton.current?.focus()
  }

  return (
    <>
      <div className="comida-fila-top">
        <span className="comida-nombre">{nombre}</span>
        {origen && <span className={`origen${origen.cambiada ? ' cambiada' : ''}`}>{origen.texto}</span>}
      </div>

      <button
        ref={boton}
        type="button"
        className={`estado-actual${estado ? '' : ' sin-definir'}`}
        style={estado ? varsEstado(estado) : undefined}
        disabled={!editable}
        aria-expanded={editable ? visible : undefined}
        aria-controls={visible ? idPanel : undefined}
        onClick={() => (visible ? cerrar() : setAbierto(true))}
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
        <div
          id={idPanel}
          className="opciones"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              cerrar()
            }
          }}
        >
          <div className="status-row" role="group" aria-label={`Elegí qué hacés con ${nombre.toLowerCase()}`}>
            {ESTADOS_COMIDA.map((opcion) => {
              const elegida = marcado === opcion
              return (
                <button
                  key={opcion}
                  type="button"
                  className={`status-chip${elegida ? ' selected' : ''}`}
                  style={varsEstado(opcion)}
                  aria-pressed={elegida}
                  // Guardando: aria-disabled y no disabled, para no perder el foco del teclado.
                  aria-disabled={pendiente || undefined}
                  onClick={() => alElegir(opcion)}
                >
                  <Icono nombre={opcion} />
                  <span>{INFO_ESTADO[opcion].etiqueta}</span>
                </button>
              )
            })}
          </div>
          {editorNota}
          <div className="opciones-pie">
            {acciones}
            <button type="button" className="btn ghost" onClick={cerrar}>
              Listo
            </button>
          </div>
        </div>
      )}
    </>
  )
}
