'use client'

import { useId, useState, type ReactNode } from 'react'
import { Icono } from '@/components/ui/iconos'

/** Sigue el desplegable de Ausencias: plegar oculta los controles, sin desmontar sus borradores. */
export function PanelPensiones({ titulo, descripcion, resumen, children }: {
  titulo: string
  descripcion: string
  resumen: string
  children: ReactNode
}) {
  const [abierto, setAbierto] = useState(false)
  const idTitulo = useId()
  const idDescripcion = useId()
  const idResumen = useId()
  const idContenido = useId()

  return <section className="card panel-pensiones" aria-labelledby={idTitulo}>
    <h2 className="section-title">
      <button type="button" className="btn ghost barra-ausencias barra-pensiones"
        aria-expanded={abierto} aria-controls={idContenido}
        aria-labelledby={idTitulo} aria-describedby={`${idDescripcion} ${idResumen}`}
        onClick={() => setAbierto((actual) => !actual)}>
        <span className="barra-pensiones-textos">
          <span id={idTitulo} className="barra-pensiones-titulo">{titulo}</span>
          <span id={idDescripcion} className="barra-pensiones-descripcion">{descripcion}</span>
          <span id={idResumen} className="barra-pensiones-resumen">{resumen}</span>
        </span>
        <Icono nombre="abajo" className="flecha" />
      </button>
    </h2>
    <div id={idContenido} className="contenido-panel-pensiones" hidden={!abierto}>
      {children}
    </div>
  </section>
}
