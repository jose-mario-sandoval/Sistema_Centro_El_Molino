'use client'

import { useState } from 'react'
import { DIAS_SEMANA_CORTOS, type DiaConEtiqueta } from '@/lib/calendario/cuadricula'
import type { Evento } from '@/lib/calendario/tipos'
import { horaHHMM, type FechaISO } from '@/lib/fechas'
import { ModalDia } from './modal-dia'

function etiquetaAccesible(dia: DiaConEtiqueta, cantidad: number): string {
  if (cantidad === 0) return dia.etiqueta
  return `${dia.etiqueta}, ${cantidad} ${cantidad === 1 ? 'evento' : 'eventos'}`
}

export function CalendarioMes({
  dias,
  eventosPorFecha,
  hoy,
  puedeEditar,
}: {
  dias: DiaConEtiqueta[]
  eventosPorFecha: Record<FechaISO, Evento[]>
  hoy: FechaISO
  puedeEditar: boolean
}) {
  const [fechaAbierta, setFechaAbierta] = useState<FechaISO | null>(null)
  const diaAbierto = dias.find((d) => d.fecha === fechaAbierta) ?? null

  return (
    <>
      <div className="cal-grid">
        {DIAS_SEMANA_CORTOS.map((nombre) => (
          <div key={nombre} className="cal-dow">
            {nombre}
          </div>
        ))}
        {dias.map((dia) => {
          const eventos = eventosPorFecha[dia.fecha] ?? []
          const esHoy = dia.fecha === hoy
          const clases = ['cal-day', dia.enMes ? '' : 'other-month', esHoy ? 'today' : ''].filter(Boolean).join(' ')
          return (
            <button
              key={dia.fecha}
              type="button"
              className={clases}
              data-fecha={dia.fecha}
              aria-label={etiquetaAccesible(dia, eventos.length)}
              aria-current={esHoy ? 'date' : undefined}
              onClick={() => setFechaAbierta(dia.fecha)}
            >
              <span className="daynum">{dia.dia}</span>
              {eventos.map((evento) => (
                <span key={evento.id} className="cal-event">
                  {evento.hora ? `${horaHHMM(evento.hora)} ` : ''}
                  {evento.titulo}
                </span>
              ))}
            </button>
          )
        })}
      </div>
      {diaAbierto && (
        <ModalDia
          dia={diaAbierto}
          eventos={eventosPorFecha[diaAbierto.fecha] ?? []}
          puedeEditar={puedeEditar}
          alCerrar={() => setFechaAbierta(null)}
        />
      )}
    </>
  )
}
