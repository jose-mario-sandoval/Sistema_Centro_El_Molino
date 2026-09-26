'use client'

import { Fragment, useEffect, useId, useRef, useState, type Ref } from 'react'
import { Icono } from '@/components/ui/iconos'
import { mensajeNota, normalizarNota, notaValida } from '@/lib/comidas/notas'
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

/** Una celda de la cuadrícula: icono + texto corto + color (+ hora). Elevada = se toca. */
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
      <Icono nombre={valor?.estado ?? 'sinDefinir'} />
      <span className="celda-texto">{corto.texto}</span>
      {corto.hora && <span className="celda-hora">{corto.hora}</span>}
    </button>
  )
}

/**
 * El plan semanal: la cuadrícula es el editor (7 días × 3 comidas). Tocar una celda abre, debajo de
 * su fila, las mismas seis opciones y el mismo campo de hora o nota que la Semana (DESIGN.md §8).
 * Una celda abierta a la vez.
 */
export function PlanEditable({ plan }: { plan: PlanSemanal }) {
  const editor = usePlanEditable(plan)
  const idPanel = useId()
  const idBase = useId()
  const [abierta, setAbierta] = useState<Celda | null>(null)
  // Estado que pide nota (temprano, tarde, enfermo) elegido o editado y todavía sin guardar.
  const [borrador, setBorrador] = useState<{ estado: EstadoComida; nota: string } | null>(null)
  const [enfocarNota, setEnfocarNota] = useState(false)
  const botonAbierto = useRef<HTMLButtonElement>(null)
  const filaAbierta = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const claveAbierta = abierta ? claveCelda(abierta.dia, abierta.comida) : null
  useEffect(() => {
    if (claveAbierta) revelar(panel.current, filaAbierta.current)
  }, [claveAbierta])

  const valorAbierto = abierta ? editor.valor(abierta.dia, abierta.comida) : null
  const pendienteAbierta = abierta ? editor.pendiente(abierta.dia, abierta.comida) : false
  const marcado = borrador?.estado ?? valorAbierto?.estado ?? null
  const tipoNota = marcado ? INFO_ESTADO[marcado].nota : null
  const notaEnPantalla = borrador ? borrador.nota : (valorAbierto?.nota ?? '')
  const notaIncompleta = borrador !== null && !notaValida(borrador.estado, normalizarNota(borrador.estado, borrador.nota))

  function tocar(celda: Celda) {
    if (claveAbierta === claveCelda(celda.dia, celda.comida)) {
      cerrar()
      return
    }
    setAbierta(celda)
    setBorrador(null)
    setEnfocarNota(false)
  }

  /** "Listo", Escape o volver a tocar la celda. Lo que quedó sin una nota válida se descarta. */
  function cerrar() {
    botonAbierto.current?.focus()
    setAbierta(null)
    setBorrador(null)
  }

  function elegir(estado: EstadoComida) {
    // Mientras se guarda, las opciones siguen enfocables (aria-disabled) pero ignoran los toques.
    if (!abierta || pendienteAbierta) return
    const { dia, comida } = abierta
    if (INFO_ESTADO[estado].nota === null) {
      setBorrador(null)
      editor.guardar(dia, comida, { estado, nota: null })
      return
    }
    // Entre estados con el mismo tipo de nota (temprano ↔ tarde) la hora se conserva.
    const mismaNota = marcado !== null && INFO_ESTADO[marcado].nota === INFO_ESTADO[estado].nota
    const nota = mismaNota ? notaEnPantalla : ''
    const normalizada = normalizarNota(estado, nota)
    if (notaValida(estado, normalizada)) {
      setBorrador(null)
      editor.guardar(dia, comida, { estado, nota: normalizada })
      return
    }
    setBorrador({ estado, nota })
    setEnfocarNota(true)
  }

  /** Con Guardar o al salir del campo: se guarda solo si la nota ya es válida. */
  function guardarNota() {
    if (!abierta || !borrador) return
    const nota = normalizarNota(borrador.estado, borrador.nota)
    if (!notaValida(borrador.estado, nota)) return
    setBorrador(null)
    editor.guardar(abierta.dia, abierta.comida, { estado: borrador.estado, nota })
  }

  function dejarSinDefinir() {
    if (!abierta || pendienteAbierta) return
    setBorrador(null)
    editor.guardar(abierta.dia, abierta.comida, null)
  }

  return (
    <div className="cuadro-marco">
      <div className="cuadro-plan">
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
                <div key={claveAbierta} ref={panel} className="cuadro-panel">
                  <PanelOpciones
                    id={idPanel}
                    nombre={`${ARTICULO[abierta.comida]} ${ETIQUETA_TIEMPO[abierta.comida].toLowerCase()} de los ${DIA_PLURAL[i]}`}
                    titulo={`¿Normalmente ${VERBO[abierta.comida]} los ${DIA_PLURAL[i]}?`}
                    marcado={marcado}
                    pendiente={pendienteAbierta}
                    alElegir={elegir}
                    alCerrar={cerrar}
                    editorNota={
                      tipoNota &&
                      marcado && (
                        <EditorNota
                          tipo={tipoNota}
                          etiqueta={tipoNota === 'hora' ? 'Hora' : 'Qué podés comer'}
                          valor={notaEnPantalla}
                          alCambiar={(nota) => setBorrador({ estado: marcado, nota })}
                          alGuardar={guardarNota}
                          alSalir={guardarNota}
                          pendiente={pendienteAbierta}
                          error={notaIncompleta && borrador ? mensajeNota(borrador.estado) : null}
                          enfocar={enfocarNota}
                        />
                      )
                    }
                    acciones={
                      valorAbierto && (
                        <button
                          type="button"
                          className="btn ghost"
                          aria-disabled={pendienteAbierta || undefined}
                          onClick={dejarSinDefinir}
                        >
                          Dejar sin definir
                        </button>
                      )
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
