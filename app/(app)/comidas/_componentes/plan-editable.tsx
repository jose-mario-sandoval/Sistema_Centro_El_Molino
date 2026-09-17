'use client'

import { Fragment, useRef, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { LARGO_MAXIMO_NOTA, mensajeNota, normalizarNota, notaValida } from '@/lib/comidas/notas'
import { NOMBRES_DIA } from '@/lib/comidas/semana'
import {
  ESTADOS_COMIDA,
  ETIQUETA_TIEMPO,
  INFO_ESTADO,
  TIEMPOS_COMIDA,
  type EstadoComida,
  type TiempoComida,
  type ValorComida,
} from '@/lib/comidas/tipos'
import type { PlanSemanal } from '@/lib/comidas/vista'
import { guardarPlan } from '../acciones'
import { estiloEstado } from './insignia-estado'

function CeldaPlan({ dia, comida, inicial }: { dia: number; comida: TiempoComida; inicial: ValorComida | null }) {
  const aviso = useAviso()
  // Refs (no estado) porque solo se leen al guardar, también desde guardados que terminan después:
  // confirmado = último valor que aceptó el servidor; pedido = último valor enviado (o confirmado).
  const confirmado = useRef<ValorComida | null>(inicial)
  const pedido = useRef<ValorComida | null>(inicial)
  // Número del último guardado iniciado en esta celda: una falla solo revierte si no hubo otro después.
  const ultimoGuardado = useRef(0)
  const [estado, setEstado] = useState<EstadoComida | ''>(inicial?.estado ?? '')
  const [nota, setNota] = useState(inicial?.nota ?? '')
  const [pendiente, iniciar] = useTransition()

  const nombre = `${NOMBRES_DIA[dia - 1]}, ${ETIQUETA_TIEMPO[comida].toLowerCase()}`
  const tipoNota = estado === '' ? null : INFO_ESTADO[estado].nota

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
      setEstado(confirmado.current?.estado ?? '')
      setNota(confirmado.current?.nota ?? '')
    })
  }

  function cambiarEstado(valor: string) {
    const nuevo = valor as EstadoComida | ''
    const mismaNota = nuevo !== '' && estado !== '' && INFO_ESTADO[nuevo].nota === INFO_ESTADO[estado].nota
    const nuevaNota = mismaNota ? nota : ''
    setEstado(nuevo)
    setNota(nuevaNota)
    guardar(nuevo, nuevaNota)
  }

  return (
    <div
      className="cell"
      style={{ gridColumn: dia + 1, gridRow: TIEMPOS_COMIDA.indexOf(comida) + 2 }}
      aria-busy={pendiente}
    >
      <div className="celda-comida" aria-hidden="true">
        {ETIQUETA_TIEMPO[comida]}
      </div>
      <select
        className="plan-status-select"
        aria-label={nombre}
        value={estado}
        style={estado === '' ? undefined : estiloEstado(estado)}
        onChange={(e) => cambiarEstado(e.target.value)}
      >
        <option value="">Sin definir</option>
        {ESTADOS_COMIDA.map((opcion) => (
          <option key={opcion} value={opcion}>
            {INFO_ESTADO[opcion].etiqueta}
          </option>
        ))}
      </select>
      {estado !== '' && tipoNota && (
        <div className="nota-plan">
          <input
            type={tipoNota === 'hora' ? 'time' : 'text'}
            aria-label={`${INFO_ESTADO[estado].ayudaNota ?? 'Nota'} (${nombre})`}
            maxLength={tipoNota === 'texto' ? LARGO_MAXIMO_NOTA : undefined}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            onBlur={() => guardar(estado, nota)}
          />
          {!notaValida(estado, normalizarNota(estado, nota)) && <div className="hint">{mensajeNota(estado)}</div>}
        </div>
      )}
    </div>
  )
}

export function PlanEditable({ plan }: { plan: PlanSemanal }) {
  return (
    <div className="card plan-scroll">
      <div className="plan-grid">
        <div className="cell head esquina" style={{ gridColumn: 1, gridRow: 1 }} />
        {TIEMPOS_COMIDA.map((comida, i) => (
          <div key={comida} className="meal-label" style={{ gridColumn: 1, gridRow: i + 2 }}>
            {ETIQUETA_TIEMPO[comida]}
          </div>
        ))}
        {NOMBRES_DIA.map((nombreDia, i) => (
          <Fragment key={nombreDia}>
            <div className="cell head" style={{ gridColumn: i + 2, gridRow: 1 }}>
              {nombreDia}
            </div>
            {TIEMPOS_COMIDA.map((comida) => (
              <CeldaPlan key={comida} dia={i + 1} comida={comida} inicial={plan[i + 1]?.[comida] ?? null} />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
