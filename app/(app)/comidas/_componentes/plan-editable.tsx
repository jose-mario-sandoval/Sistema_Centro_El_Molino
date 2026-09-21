'use client'

import { useCallback, useId, useRef, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Icono } from '@/components/ui/iconos'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { LARGO_MAXIMO_NOTA, mensajeNota, normalizarNota, notaValida } from '@/lib/comidas/notas'
import { NOMBRES_DIA } from '@/lib/comidas/semana'
import {
  ETIQUETA_TIEMPO,
  INFO_ESTADO,
  TIEMPOS_COMIDA,
  type EstadoComida,
  type TiempoComida,
  type ValorComida,
} from '@/lib/comidas/tipos'
import type { PlanSemanal } from '@/lib/comidas/vista'
import { guardarPlan } from '../acciones'
import { textoNota, varsEstado } from './insignia-estado'
import { SelectorComida } from './selector-comida'

const VERBO: Record<TiempoComida, string> = { desayuno: 'desayunás', almuerzo: 'almorzás', cena: 'cenás' }
const DIA_PLURAL = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados', 'domingos'] as const
const CORTA: Record<EstadoComida, string> = {
  si: 'Sí',
  no: 'No',
  temprano: 'Temprano',
  tarde: 'Tarde',
  bolsa: 'Bolsa',
  enfermo: 'Enfermo',
}

type AlMostrar = (dia: number, comida: TiempoComida, estado: EstadoComida | null) => void

function FilaPlan({
  dia,
  comida,
  inicial,
  alMostrar,
}: {
  dia: number
  comida: TiempoComida
  inicial: ValorComida | null
  alMostrar: AlMostrar
}) {
  const aviso = useAviso()
  const idNota = useId()
  // Refs (no estado) porque solo se leen al guardar, también desde guardados que terminan después:
  // confirmado = último valor que aceptó el servidor; pedido = último valor enviado (o confirmado).
  const confirmado = useRef<ValorComida | null>(inicial)
  const pedido = useRef<ValorComida | null>(inicial)
  // Número del último guardado iniciado en esta fila: una falla solo revierte si no hubo otro después.
  const ultimoGuardado = useRef(0)
  const [estado, setEstado] = useState<EstadoComida | ''>(inicial?.estado ?? '')
  const [nota, setNota] = useState(inicial?.nota ?? '')
  const [pendiente, iniciar] = useTransition()

  const tipoNota = estado === '' ? null : INFO_ESTADO[estado].nota
  // Un estado que lleva nota no se guarda hasta que la nota es válida: mientras tanto, abierto.
  const notaPendiente = estado !== '' && tipoNota !== null && !notaValida(estado, normalizarNota(estado, nota))

  function mostrar(nuevoEstado: EstadoComida | '', nuevaNota: string) {
    setEstado(nuevoEstado)
    setNota(nuevaNota)
    alMostrar(dia, comida, nuevoEstado === '' ? null : nuevoEstado)
  }

  function guardar(nuevoEstado: EstadoComida | '', nuevaNota: string) {
    const notaFinal = nuevoEstado === '' ? null : normalizarNota(nuevoEstado, nuevaNota)
    // Un estado que lleva nota se guarda recién cuando la nota es válida.
    if (nuevoEstado !== '' && !notaValida(nuevoEstado, notaFinal)) return
    // Se compara con lo último pedido: si hay un guardado en curso, volver al valor anterior también se guarda.
    if ((pedido.current?.estado ?? '') === nuevoEstado && (pedido.current?.nota ?? null) === notaFinal) return

    const nuevo = nuevoEstado === '' ? null : { estado: nuevoEstado, nota: notaFinal }
    pedido.current = nuevo
    const numero = ++ultimoGuardado.current
    iniciar(async () => {
      let resultado: Resultado<null>
      try {
        resultado = await guardarPlan({
          diaSemana: dia,
          comida,
          estado: nuevo?.estado ?? null,
          nota: notaFinal,
        })
      } catch {
        // Sin conexión o error inesperado: aviso y se revierte, sin pasar a la pantalla de error (spec §9.1).
        resultado = fallo('No se pudo guardar. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) {
        confirmado.current = nuevo
        aviso('Plan semanal actualizado')
        return
      }
      aviso(resultado.error)
      // Si la persona ya eligió otra cosa después, no pisamos esa elección con el valor anterior.
      if (numero !== ultimoGuardado.current) return
      pedido.current = confirmado.current
      mostrar(confirmado.current?.estado ?? '', confirmado.current?.nota ?? '')
    })
  }

  function cambiarEstado(nuevo: EstadoComida | '') {
    const mismaNota = nuevo !== '' && estado !== '' && INFO_ESTADO[nuevo].nota === INFO_ESTADO[estado].nota
    const nuevaNota = mismaNota ? nota : ''
    mostrar(nuevo, nuevaNota)
    guardar(nuevo, nuevaNota)
  }

  /** "Listo" con la nota a medio escribir: se descarta la elección y vuelve lo guardado. */
  function descartarSinNota() {
    if (!notaPendiente) return
    mostrar(confirmado.current?.estado ?? '', confirmado.current?.nota ?? '')
  }

  return (
    <div
      className="comida-fila"
      role="group"
      aria-label={`${ETIQUETA_TIEMPO[comida]}, ${NOMBRES_DIA[dia - 1]}`}
      aria-busy={pendiente}
    >
      <SelectorComida
        nombre={ETIQUETA_TIEMPO[comida]}
        estado={estado === '' ? null : estado}
        marcado={estado === '' ? null : estado}
        pregunta={`¿Normalmente ${VERBO[comida]} los ${DIA_PLURAL[dia - 1]}?`}
        nota={estado !== '' && !notaPendiente && nota ? textoNota(estado, nota) : null}
        pendiente={pendiente}
        editorAbierto={notaPendiente}
        alElegir={(nuevo) => {
          if (pendiente || nuevo === estado) return
          cambiarEstado(nuevo)
        }}
        alCerrar={descartarSinNota}
        editorNota={
          estado !== '' &&
          tipoNota && (
            <form
              className="note-field editor-nota"
              onSubmit={(e) => {
                e.preventDefault()
                guardar(estado, nota)
              }}
            >
              <label htmlFor={idNota}>{INFO_ESTADO[estado].ayudaNota ?? 'Nota'}</label>
              <input
                id={idNota}
                type={tipoNota === 'hora' ? 'time' : 'text'}
                maxLength={tipoNota === 'texto' ? LARGO_MAXIMO_NOTA : undefined}
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                onBlur={() => guardar(estado, nota)}
              />
              {notaPendiente && <div className="hint">{mensajeNota(estado)}</div>}
              <div className="acciones-formulario">
                <button type="submit" className="btn" aria-disabled={pendiente || undefined}>
                  Guardar
                </button>
              </div>
            </form>
          )
        }
        acciones={
          estado !== '' && (
            <button type="button" className="btn ghost" disabled={pendiente} onClick={() => cambiarEstado('')}>
              Dejar sin definir
            </button>
          )
        }
      />
    </div>
  )
}

/** Resumen de la semana tipo, solo en escritorio y solo para mirar: repite lo que está abajo. */
function ResumenPlan({ plan }: { plan: PlanSemanal }) {
  return (
    <div className="card resumen-plan" aria-hidden="true">
      <div className="section-title">Resumen</div>
      <div className="matriz">
        <span />
        {NOMBRES_DIA.map((nombre) => (
          <span key={nombre} className="matriz-cab">
            {nombre.slice(0, 3)}
          </span>
        ))}
        {TIEMPOS_COMIDA.map((comida) => (
          <div key={comida} className="matriz-fila">
            <span className="matriz-nombre">{ETIQUETA_TIEMPO[comida]}</span>
            {NOMBRES_DIA.map((nombre, i) => {
              const estado = plan[i + 1]?.[comida]?.estado
              return estado ? (
                <span key={nombre} className="matriz-celda" style={varsEstado(estado)}>
                  <Icono nombre={estado} />
                  {CORTA[estado]}
                </span>
              ) : (
                <span key={nombre} className="matriz-celda vacia">
                  <Icono nombre="sinDefinir" />
                  Falta
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export function PlanEditable({ plan }: { plan: PlanSemanal }) {
  const [resumen, setResumen] = useState(plan)

  const alMostrar = useCallback<AlMostrar>((dia, comida, estado) => {
    setResumen((anterior) => ({
      ...anterior,
      [dia]: { ...anterior[dia], [comida]: estado ? { estado, nota: null } : undefined },
    }))
  }, [])

  return (
    <>
      <ResumenPlan plan={resumen} />
      <div className="plan-lista">
        {NOMBRES_DIA.map((nombreDia, i) => (
          <section key={nombreDia} className="day-row" aria-label={`${nombreDia}, todas las semanas`}>
            <div className="day-row-top">
              <div className="day-title">
                <span className="dname">{nombreDia}</span>
                <span className="ddate">todas las semanas</span>
              </div>
            </div>
            {TIEMPOS_COMIDA.map((comida) => (
              <FilaPlan
                key={comida}
                dia={i + 1}
                comida={comida}
                inicial={plan[i + 1]?.[comida] ?? null}
                alMostrar={alMostrar}
              />
            ))}
          </section>
        ))}
      </div>
    </>
  )
}
