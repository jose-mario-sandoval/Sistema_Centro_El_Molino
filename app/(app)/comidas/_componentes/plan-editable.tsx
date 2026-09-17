'use client'

import { Fragment, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
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
  const [guardado, setGuardado] = useState<ValorComida | null>(inicial)
  const [estado, setEstado] = useState<EstadoComida | ''>(inicial?.estado ?? '')
  const [nota, setNota] = useState(inicial?.nota ?? '')
  const [pendiente, iniciar] = useTransition()

  const nombre = `${NOMBRES_DIA[dia - 1]}, ${ETIQUETA_TIEMPO[comida].toLowerCase()}`
  const tipoNota = estado === '' ? null : INFO_ESTADO[estado].nota

  function guardar(nuevoEstado: EstadoComida | '', nuevaNota: string) {
    const notaFinal = nuevoEstado === '' ? null : normalizarNota(nuevoEstado, nuevaNota)
    // Un estado que lleva nota se guarda recién cuando la nota es válida.
    if (nuevoEstado !== '' && !notaValida(nuevoEstado, notaFinal)) return
    if ((guardado?.estado ?? '') === nuevoEstado && (guardado?.nota ?? null) === notaFinal) return

    const anterior = guardado
    iniciar(async () => {
      const resultado = await guardarPlan({
        diaSemana: dia,
        comida,
        estado: nuevoEstado === '' ? null : nuevoEstado,
        nota: notaFinal,
      })
      if (resultado.ok) {
        setGuardado(nuevoEstado === '' ? null : { estado: nuevoEstado, nota: notaFinal })
        aviso('Plan semanal actualizado')
        return
      }
      setEstado(anterior?.estado ?? '')
      setNota(anterior?.nota ?? '')
      aviso(resultado.error)
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
