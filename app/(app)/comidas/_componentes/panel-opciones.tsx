'use client'

import { Icono } from '@/components/ui/iconos'
import { ESTADOS_COMIDA, INFO_ESTADO, type EstadoComida } from '@/lib/comidas/tipos'
import { varsEstado } from './insignia-estado'

/**
 * Las seis opciones de una comida, dentro de una bandeja hundida (DESIGN.md §8): la misma pieza en
 * la burbuja del Plan semanal, de la Semana y de La casa. Solo pinta; guardar es de quien la usa.
 *
 * La elegida queda hundida, con su color, su icono y el texto en negrita. "Listo" llama a `alListo`:
 * quien abrió la burbuja guarda lo escrito o, si no sirve, la deja abierta. Escape lo atiende la
 * burbuja (descarta).
 */
export function PanelOpciones({
  nombre,
  etiquetaGrupo,
  titulo,
  marcado,
  pendiente,
  alElegir,
  alListo,
  editorNota,
  acciones,
}: {
  /** 'Almuerzo' / 'el almuerzo de los martes': completa "Elegí qué hacés con …". */
  nombre: string
  /** Nombre del grupo de opciones, si no sirve "Elegí qué hacés con …" (p. ej. en tercera persona). */
  etiquetaGrupo?: string
  /** La pregunta arriba de las opciones ("¿Vas a almorzar el miércoles?"). */
  titulo?: React.ReactNode
  /** Opción hundida (null = ninguna). */
  marcado: EstadoComida | null
  /** Guardando: las opciones siguen enfocables pero no responden. */
  pendiente: boolean
  alElegir: (estado: EstadoComida) => void
  alListo: () => void
  /** Debajo de las opciones: el campo de la hora o la nota, o la nota ya guardada. */
  editorNota?: React.ReactNode
  acciones?: React.ReactNode
}) {
  return (
    <div className="opciones">
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
        <button type="button" className="btn ghost" onClick={alListo}>
          Listo
        </button>
      </div>
    </div>
  )
}
