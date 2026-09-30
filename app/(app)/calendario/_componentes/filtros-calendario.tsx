'use client'

import { useId, useRef, useState } from 'react'
import { Icono } from '@/components/ui/iconos'
import { textoOcultos, type Filtro } from '@/lib/calendario/filtros'
import { ETIQUETA_TIPO, TIPOS_EVENTO, varsTipo } from '@/lib/calendario/tipos'
import { MarcaTipo } from './marca-tipo'

/** Mostrado: hundido y con visto. Oculto: elevado (se toca para volver a verlo), ojo tachado y "Oculto" escrito. */
function EstadoChip({ visible }: { visible: boolean }) {
  return (
    <span className="chip-estado" aria-hidden="true">
      {visible ? (
        <Icono nombre="si" />
      ) : (
        <>
          <Icono nombre="oculto" />
          Oculto
        </>
      )}
    </span>
  )
}

/**
 * Filtros del calendario (Director y Residente) y el aviso de lo que está oculto. Cada chip es un
 * interruptor (`aria-pressed` = se ve); "Solo eventos con pedido a cocina" es un `switch`. En un
 * teléfono los chips van detrás del botón "Filtros"; el aviso siempre se ve.
 */
export function FiltrosCalendario({
  ocultos,
  alAlternar,
  alMostrarTodo,
}: {
  ocultos: readonly Filtro[]
  alAlternar: (filtro: Filtro) => void
  alMostrarTodo: () => void
}) {
  const id = useId()
  const [abierto, setAbierto] = useState(false)
  const seccion = useRef<HTMLElement>(null)
  const aviso = textoOcultos(ocultos)
  const soloCocina = ocultos.includes('sin_pedido')
  const cuantos = ocultos.length

  function mostrarTodo() {
    alMostrarTodo()
    // "Mostrar todo" desaparece con el aviso: el foco pasa al primer control de los filtros que se vea
    // (un chip en escritorio, el botón "Filtros" en el teléfono), nunca se pierde en <body>.
    const controles = seccion.current?.querySelectorAll<HTMLElement>('.filtros-alternar, .chip-filtro') ?? []
    ;[...controles].find((c) => c.getClientRects().length > 0)?.focus()
  }

  return (
    <>
      <section ref={seccion} className="filtros-cal" data-abierto={abierto ? '' : undefined} aria-labelledby={`${id}-titulo`}>
        <h2 id={`${id}-titulo`} className="section-title filtros-titulo">
          Filtros
        </h2>
        <button
          type="button"
          className="btn ghost filtros-alternar"
          aria-expanded={abierto}
          aria-controls={`${id}-cuerpo`}
          onClick={() => setAbierto(!abierto)}
        >
          <span>
            Filtros
            <span className="filtros-resumen">
              {' · '}
              {cuantos === 0 ? 'todo a la vista' : `${cuantos} ${cuantos === 1 ? 'oculto' : 'ocultos'}`}
            </span>
          </span>
          <Icono nombre="abajo" className="flecha" />
        </button>
        <div id={`${id}-cuerpo`} className="filtros-cuerpo">
          <p className="hint filtros-ayuda" id={`${id}-ayuda`}>
            Tocá un filtro para mostrarlo u ocultarlo en el calendario.
          </p>
          <div className="filtros-chips" role="group" aria-labelledby={`${id}-titulo`} aria-describedby={`${id}-ayuda`}>
            {TIPOS_EVENTO.map((tipo) => {
              const visible = !ocultos.includes(tipo)
              return (
                <button
                  key={tipo}
                  type="button"
                  className="chip-filtro"
                  data-filtro={tipo}
                  aria-pressed={visible}
                  style={varsTipo(tipo)}
                  onClick={() => alAlternar(tipo)}
                >
                  <MarcaTipo tipo={tipo} />
                  <span className="chip-etiqueta">{ETIQUETA_TIPO[tipo]}</span>
                  <EstadoChip visible={visible} />
                </button>
              )
            })}
            <button
              type="button"
              className="chip-filtro chip-ausencias"
              data-filtro="ausencias"
              aria-pressed={!ocultos.includes('ausencias')}
              onClick={() => alAlternar('ausencias')}
            >
              <span className="marca-ausencia" aria-hidden="true">
                <Icono nombre="ausencia" />
              </span>
              <span className="chip-etiqueta">Mis ausencias</span>
              <EstadoChip visible={!ocultos.includes('ausencias')} />
            </button>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={soloCocina}
            className="chip-filtro chip-cocina"
            data-filtro="sin_pedido"
            onClick={() => alAlternar('sin_pedido')}
          >
            <span className="marca-cocina" aria-hidden="true">
              <Icono nombre="merienda" />
            </span>
            <span className="chip-etiqueta">Solo eventos con pedido a cocina</span>
            <span className="interruptor" aria-hidden="true">
              <span className="interruptor-perilla" />
            </span>
            <span className="chip-estado" aria-hidden="true">
              {soloCocina ? 'Sí' : 'No'}
            </span>
          </button>
        </div>
      </section>

      {/* Siempre presente: así el lector de pantalla anuncia cada cambio (y "Se ve todo" al volver). */}
      <div className="aviso-filtros-zona" aria-live="polite">
        {aviso ? (
          <div className="aviso-filtros">
            <Icono nombre="oculto" />
            <p>{aviso}</p>
            <button type="button" className="btn ghost small" onClick={mostrarTodo}>
              Mostrar todo
            </button>
          </div>
        ) : (
          <p className="sr-only">Se ve todo el calendario.</p>
        )}
      </div>
    </>
  )
}
