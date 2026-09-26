'use client'

import { Fragment, useEffect, useId, useRef, useState, type Ref } from 'react'
import { Icono } from '@/components/ui/iconos'
import { notaInicial } from '@/lib/comidas/notas'
import { claveCelda, etiquetaCelda } from '@/lib/comidas/plan'
import { NOMBRES_DIA } from '@/lib/comidas/semana'
import {
  ETIQUETA_TIEMPO,
  INFO_ESTADO,
  TIEMPOS_COMIDA,
  type EstadoComida,
  type TiempoComida,
  type ValorComida,
} from '@/lib/comidas/tipos'
import { textoCorto, type PlanSemanal } from '@/lib/comidas/vista'
import { EditorNota } from './editor-nota'
import { varsEstado } from './insignia-estado'
import { PanelOpciones } from './panel-opciones'
import { revelar } from './revelar'
import { usePlanEditable } from './usar-plan-editable'

const VERBO: Record<TiempoComida, string> = { desayuno: 'desayunás', almuerzo: 'almorzás', cena: 'cenás' }
const ARTICULO: Record<TiempoComida, string> = { desayuno: 'el', almuerzo: 'el', cena: 'la' }
const DIA_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'] as const

type Celda = { dia: number; comida: TiempoComida }

/**
 * Una celda de la cuadrícula: icono + texto corto + color (+ hora). Elevada = se toca. Con letra
 * grande o pantalla angosta ocupa la fila entera y escribe también el nombre de la comida.
 */
function CeldaPlan({
  ref,
  celda,
  valor,
  abierta,
  controla,
  pendiente,
  alTocar,
}: {
  ref?: Ref<HTMLButtonElement>
  celda: Celda
  valor: ValorComida | null
  abierta: boolean
  controla: string
  pendiente: boolean
  alTocar: () => void
}) {
  const corto = textoCorto(valor)
  return (
    <button
      ref={ref}
      type="button"
      className={`celda-plan${valor ? '' : ' vacia'}`}
      style={valor ? varsEstado(valor.estado) : undefined}
      aria-label={etiquetaCelda(celda.dia, celda.comida, valor)}
      aria-expanded={abierta}
      aria-controls={abierta ? controla : undefined}
      aria-busy={pendiente || undefined}
      onClick={alTocar}
    >
      <span className="celda-comida">{ETIQUETA_TIEMPO[celda.comida]}</span>
      <span className="celda-valor">
        <Icono nombre={valor?.estado ?? 'sinDefinir'} />
        <span className="celda-texto">{corto.texto}</span>
        {corto.hora && <span className="celda-hora">{corto.hora}</span>}
      </span>
    </button>
  )
}

/**
 * El plan semanal: la cuadrícula es el editor (7 días × 3 comidas). Tocar una celda abre, debajo de
 * su fila, las mismas seis opciones y el mismo campo de hora o nota que la Semana, con el mismo
 * comportamiento (DESIGN.md §8). Una celda abierta a la vez.
 */
export function PlanEditable({ plan }: { plan: PlanSemanal }) {
  const editor = usePlanEditable(plan)
  const idPanel = useId()
  const idBase = useId()
  const [abierta, setAbierta] = useState<Celda | null>(null)
  // Estado que pide nota (temprano, tarde, enfermo) elegido y todavía sin "Guardar".
  const [borrador, setBorrador] = useState<{ estado: EstadoComida; nota: string } | null>(null)
  const botonAbierto = useRef<HTMLButtonElement>(null)
  const filaAbierta = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const claveAbierta = abierta ? claveCelda(abierta.dia, abierta.comida) : null
  useEffect(() => {
    if (claveAbierta) revelar(panel.current, filaAbierta.current)
  }, [claveAbierta])

  const valorAbierto = abierta ? editor.valor(abierta.dia, abierta.comida) : null
  const pendienteAbierta = abierta ? editor.pendiente(abierta.dia, abierta.comida) : false

  function tocar(celda: Celda) {
    if (claveAbierta === claveCelda(celda.dia, celda.comida)) {
      cerrar()
      return
    }
    setAbierta(celda)
    setBorrador(null)
  }

  /** "Listo", Escape o volver a tocar la celda. Una nota sin "Guardar" se descarta, como en la Semana. */
  function cerrar() {
    botonAbierto.current?.focus()
    setAbierta(null)
    setBorrador(null)
  }

  // Sin esperar a que termine otro guardado: las acciones del servidor se envían de a una y en orden,
  // y usePlanEditable no deja que una respuesta vieja pise una elección más nueva.
  function elegir(estado: EstadoComida) {
    if (!abierta) return
    if (INFO_ESTADO[estado].nota) {
      // Lo que se estaba escribiendo, o lo guardado: temprano ↔ tarde conservan la hora.
      setBorrador({ estado, nota: notaInicial(borrador ?? valorAbierto, estado) })
      return
    }
    setBorrador(null)
    editor.guardar(abierta.dia, abierta.comida, { estado, nota: null })
  }

  function dejarSinDefinir() {
    if (!abierta) return
    setBorrador(null)
    editor.guardar(abierta.dia, abierta.comida, null)
  }

  return (
    <div className="cuadro-marco">
      <div
        className="cuadro-plan"
        // Escape con el foco todavía en la celda abierta también cierra (dentro del panel lo atiende él).
        onKeyDown={(e) => {
          if (e.key === 'Escape' && abierta) cerrar()
        }}
      >
        {/* Solo visual: cada celda ya dice en su nombre accesible qué día y qué comida es. */}
        <div className="cuadro-cabecera" aria-hidden="true">
          <span className="cuadro-esquina" />
          {TIEMPOS_COMIDA.map((comida) => (
            <span key={comida} className="cuadro-cab">
              {ETIQUETA_TIEMPO[comida]}
            </span>
          ))}
        </div>

        {NOMBRES_DIA.map((nombreDia, i) => {
          const dia = i + 1
          const idDia = `${idBase}-dia-${dia}`
          return (
            <Fragment key={nombreDia}>
              <div
                ref={abierta?.dia === dia ? filaAbierta : undefined}
                className="cuadro-fila"
                role="group"
                aria-labelledby={idDia}
              >
                <span id={idDia} className="cuadro-dia">
                  {nombreDia}
                </span>
                {TIEMPOS_COMIDA.map((comida) => {
                  const esta = abierta?.dia === dia && abierta.comida === comida
                  return (
                    <CeldaPlan
                      key={comida}
                      ref={esta ? botonAbierto : undefined}
                      celda={{ dia, comida }}
                      valor={editor.valor(dia, comida)}
                      abierta={esta}
                      controla={idPanel}
                      pendiente={editor.pendiente(dia, comida)}
                      alTocar={() => tocar({ dia, comida })}
                    />
                  )
                })}
              </div>

              {abierta?.dia === dia && (
                <div key={claveAbierta} ref={panel} className="cuadro-panel" aria-busy={pendienteAbierta || undefined}>
                  <PanelOpciones
                    id={idPanel}
                    nombre={`${ARTICULO[abierta.comida]} ${ETIQUETA_TIEMPO[abierta.comida].toLowerCase()} de los ${DIA_PLURAL[i]}`}
                    titulo={`¿Normalmente ${VERBO[abierta.comida]} los ${DIA_PLURAL[i]}?`}
                    marcado={borrador?.estado ?? valorAbierto?.estado ?? null}
                    // La celda y el panel avisan con aria-busy; las opciones siguen respondiendo.
                    pendiente={false}
                    alElegir={elegir}
                    alCerrar={cerrar}
                    editorNota={
                      borrador && (
                        <EditorNota
                          key={borrador.estado}
                          estado={borrador.estado}
                          valor={borrador.nota}
                          alCambiar={(nota) => setBorrador({ ...borrador, nota })}
                          alGuardar={(nota) => {
                            setBorrador(null)
                            editor.guardar(abierta.dia, abierta.comida, { estado: borrador.estado, nota })
                          }}
                          alCancelar={() => setBorrador(null)}
                          pendiente={false}
                        />
                      )
                    }
                    acciones={
                      // Siempre presente (deshabilitado si ya está sin definir): el pie del panel no
                      // cambia de forma al guardar, así "Listo" no se corre bajo el dedo.
                      <button type="button" className="btn ghost" disabled={!valorAbierto} onClick={dejarSinDefinir}>
                        Dejar sin definir
                      </button>
                    }
                  />
                </div>
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
