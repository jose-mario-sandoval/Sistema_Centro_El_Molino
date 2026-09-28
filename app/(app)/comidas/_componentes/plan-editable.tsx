'use client'

import { useId, useRef, useState, type Ref } from 'react'
import { Burbuja, devolverFoco, type MotivoCierre } from '@/components/ui/burbuja'
import { Icono } from '@/components/ui/iconos'
import { claveCelda, diaPlural, etiquetaCelda, queComidaPlan, tituloComidaPlan } from '@/lib/comidas/plan'
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
import { CAMBIADA_POR_EL_DIRECTOR, etiquetaNota, etiquetaOpciones, preguntaPlan, type Voz } from '@/lib/comidas/voz'
import { EditorNota } from './editor-nota'
import { varsEstado } from './insignia-estado'
import { PanelOpciones } from './panel-opciones'
import { propsEditorNota, useBorradorNota } from './usar-borrador-nota'
import { usePlanEditable } from './usar-plan-editable'

type Celda = { dia: number; comida: TiempoComida }

function etiquetaNotaPlan(estado: EstadoComida, voz: Voz): string | undefined {
  const tipo = INFO_ESTADO[estado].nota
  return tipo ? etiquetaNota(tipo, voz) : undefined
}

/**
 * Una celda de la cuadrícula: icono + texto corto + color (+ hora). Elevada = se toca. Con letra
 * grande o pantalla angosta ocupa la fila entera y escribe también el nombre de la comida.
 */
function CeldaPlan({
  ref,
  celda,
  valor,
  cambiadaPorOtro,
  abierta,
  controla,
  pendiente,
  alTocar,
}: {
  ref?: Ref<HTMLButtonElement>
  celda: Celda
  valor: ValorComida | null
  /** La cambió el Director: lo dice su nombre accesible (y la burbuja al abrirla). */
  cambiadaPorOtro: boolean
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
      data-abre-burbuja=""
      aria-label={etiquetaCelda(celda.dia, celda.comida, valor, cambiadaPorOtro)}
      aria-haspopup="dialog"
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
      {/* La cambió el Director: lápiz + texto a la vista (la leyenda de arriba lo explica entero). */}
      {valor && cambiadaPorOtro && (
        <span className="celda-director">
          <Icono nombre="editado" />
          Director
        </span>
      )}
    </button>
  )
}

/**
 * El plan semanal: la cuadrícula es el editor (7 días × 3 comidas). Tocar una celda abre, en una
 * burbuja junto a ella, las mismas seis opciones y el mismo campo de hora o nota que la Semana, con el
 * mismo comportamiento (DESIGN.md §8). Una burbuja a la vez. En La casa, el Director edita el de otra
 * persona: `usuarioId` va a cada guardado y los textos pasan a tercera persona.
 */
export function PlanEditable({
  plan,
  usuarioId,
  voz = 'propia',
  persona,
}: {
  plan: PlanSemanal
  usuarioId?: string
  voz?: Voz
  /** Nombre de la persona (La casa). */
  persona?: string
}) {
  const editor = usePlanEditable(plan, { usuarioId, porOtro: voz === 'ajena' })
  const idBase = useId()
  const idBurbuja = `${idBase}-burbuja`
  const [abierta, setAbierta] = useState<Celda | null>(null)
  const botonAbierto = useRef<HTMLButtonElement>(null)

  const claveAbierta = abierta ? claveCelda(abierta.dia, abierta.comida) : null
  const valorAbierto = abierta ? editor.valor(abierta.dia, abierta.comida) : null
  // La nota a medio escribir de la celda abierta: la misma lógica que en la Semana.
  const nota = useBorradorNota(
    valorAbierto,
    (valor) => {
      if (abierta) editor.guardar(abierta.dia, abierta.comida, valor)
    },
    voz,
  )

  /**
   * Volver a tocar la celda abierta cierra, y tocar otra cambia de celda: en los dos casos lo que
   * quedó escrito se guarda (o, si no sirve, la burbuja sigue abierta con el error a la vista).
   */
  function tocar(celda: Celda) {
    if (claveAbierta === claveCelda(celda.dia, celda.comida)) {
      cerrar('listo')
      return
    }
    if (!nota.confirmar({ alCerrar: true })) return
    setAbierta(celda)
  }

  /** "Listo", un toque fuera o Tab guardan lo escrito (o avisan y no cierran); Escape descarta. */
  function cerrar(motivo: MotivoCierre): boolean {
    if (motivo === 'escape') nota.descartar()
    else if (!nota.confirmar({ alCerrar: true })) return false
    const boton = botonAbierto.current
    setAbierta(null)
    devolverFoco(motivo, boton)
    return true
  }

  // Sin esperar a que termine otro guardado: las acciones del servidor se envían de a una y en orden,
  // y usePlanEditable no deja que una respuesta vieja pise una elección más nueva.
  function elegir(estado: EstadoComida) {
    if (!abierta) return
    if (INFO_ESTADO[estado].nota) {
      nota.elegir(estado)
      return
    }
    nota.descartar()
    editor.guardar(abierta.dia, abierta.comida, { estado, nota: null })
  }

  function dejarSinDefinir() {
    if (!abierta) return
    nota.descartar()
    editor.guardar(abierta.dia, abierta.comida, null)
  }

  const hayDelDirector = NOMBRES_DIA.some((_, i) =>
    TIEMPOS_COMIDA.some((comida) => editor.valor(i + 1, comida) !== null && editor.cambiadaPorOtro(i + 1, comida)),
  )

  return (
    <div className="cuadro-marco">
      {hayDelDirector && (
        <p className="leyenda-director">
          <span className="celda-director">
            <Icono nombre="editado" />
            Director
          </span>
          {voz === 'propia' ? '= la cambió el Director, no vos.' : '= la cambió un Director.'}
        </p>
      )}
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
            <div key={nombreDia} className="cuadro-fila" role="group" aria-labelledby={idDia}>
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
                    cambiadaPorOtro={editor.cambiadaPorOtro(dia, comida)}
                    abierta={esta}
                    controla={idBurbuja}
                    pendiente={editor.pendiente(dia, comida)}
                    alTocar={() => tocar({ dia, comida })}
                  />
                )
              })}
            </div>
          )
        })}
      </div>

      {abierta && (
        <Burbuja
          key={claveAbierta}
          id={idBurbuja}
          ancla={botonAbierto}
          tituloId={`${idBurbuja}-titulo`}
          className="burbuja-plan"
          alCerrar={cerrar}
        >
          <div className="burbuja-cabeza">
            <h2 id={`${idBurbuja}-titulo`} className="burbuja-titulo">
              {tituloComidaPlan(abierta.dia, abierta.comida)}
            </h2>
            {valorAbierto && editor.cambiadaPorOtro(abierta.dia, abierta.comida) && (
              <span className="origen cambiada">{CAMBIADA_POR_EL_DIRECTOR}</span>
            )}
          </div>
          <PanelOpciones
            nombre={queComidaPlan(abierta.dia, abierta.comida)}
            etiquetaGrupo={etiquetaOpciones(queComidaPlan(abierta.dia, abierta.comida), voz, persona)}
            titulo={preguntaPlan(abierta.comida, diaPlural(abierta.dia), voz)}
            marcado={nota.borrador?.estado ?? valorAbierto?.estado ?? null}
            // La celda avisa con aria-busy; las opciones siguen respondiendo.
            pendiente={false}
            alElegir={elegir}
            alListo={() => cerrar('listo')}
            editorNota={
              nota.borrador && (
                <EditorNota
                  key={nota.borrador.estado}
                  estado={nota.borrador.estado}
                  etiqueta={etiquetaNotaPlan(nota.borrador.estado, voz)}
                  {...propsEditorNota(nota)}
                  pendiente={false}
                />
              )
            }
            acciones={
              // Siempre presente (deshabilitado si ya está sin definir): el pie no cambia de forma al
              // guardar, así "Listo" no se corre bajo el dedo.
              <button type="button" className="btn ghost" disabled={!valorAbierto} onClick={dejarSinDefinir}>
                Dejar sin definir
              </button>
            }
          />
        </Burbuja>
      )}
    </div>
  )
}
