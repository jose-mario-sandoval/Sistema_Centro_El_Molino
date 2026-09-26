'use client'

import { Icono } from '@/components/ui/iconos'
import { ESTADOS_COMIDA, INFO_ESTADO, type EstadoComida } from '@/lib/comidas/tipos'
import { varsEstado } from './insignia-estado'

/**
 * Las seis opciones de una comida, dentro de una bandeja hundida (DESIGN.md §8): la misma pieza en
 * Plan semanal, Semana y La casa. Solo pinta; guardar es de quien la usa.
 *
 * La elegida queda hundida, con su color, su icono y el texto en negrita. "Listo" y Escape llaman a
 * `alCerrar`: quien abrió el panel cierra y le devuelve el foco a su botón.
 */
export function PanelOpciones({
  id,
  nombre,
  etiquetaGrupo,
  titulo,
  marcado,
  pendiente,
  alElegir,
  alCerrar,
  editorNota,
  acciones,
}: {
  id: string
  /** 'Almuerzo' / 'el almuerzo de los martes': completa "Elegí qué hacés con …". */
  nombre: string
  /** Nombre del grupo de opciones, si no sirve "Elegí qué hacés con …" (p. ej. en tercera persona). */
  etiquetaGrupo?: string
  /** Texto arriba de las opciones, si el botón que las abrió no lo dice ya. */
  titulo?: React.ReactNode
  /** Opción hundida (null = ninguna). */
  marcado: EstadoComida | null
  /** Guardando: las opciones siguen enfocables pero no responden. */
  pendiente: boolean
  alElegir: (estado: EstadoComida) => void
  alCerrar: () => void
  editorNota?: React.ReactNode
  acciones?: React.ReactNode
}) {
  return (
    <div
      id={id}
      className="opciones"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          alCerrar()
        }
      }}
    >
      {titulo && <p className="opciones-titulo">{titulo}</p>}
      <div
        className="status-row"
        role="group"
        aria-label={etiquetaGrupo ?? `Elegí qué hacés con ${nombre.toLowerCase()}`}
      >
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
        <button type="button" className="btn ghost" onClick={alCerrar}>
          Listo
        </button>
      </div>
    </div>
  )
}
