'use client'

import { useState } from 'react'
import { Icono } from '@/components/ui/iconos'
import { estaAusente, type RangoAusencia } from '@/lib/ausencias/tipos'
import { DIAS_SEMANA_CORTOS, type DiaConEtiqueta } from '@/lib/calendario/cuadricula'
import type { Evento } from '@/lib/calendario/tipos'
import { horaHHMM, type FechaISO } from '@/lib/fechas'
import { InsigniasEvento } from './insignias-evento'
import { ModalDia } from './modal-dia'

function etiquetaAccesible(dia: DiaConEtiqueta, cantidad: number, paraCocina: boolean, ausente: boolean): string {
  const sufijo = ausente ? ', ausente' : ''
  if (cantidad === 0) return `${dia.etiqueta}${sufijo}`
  if (paraCocina) return `${dia.etiqueta}, ${cantidad} ${cantidad === 1 ? 'pedido' : 'pedidos'} para la cocina${sufijo}`
  return `${dia.etiqueta}, ${cantidad} ${cantidad === 1 ? 'evento' : 'eventos'}${sufijo}`
}

function textoEvento(evento: Evento): string {
  return `${evento.hora ? `${horaHHMM(evento.hora)} ` : ''}${evento.titulo}`
}

/**
 * En el teléfono, siete columnas dejan días de ~40px, que no se pueden tocar con seguridad: por
 * eso ahí abre en lista (agenda) y la cuadrícula queda a un toque. En escritorio, siempre la
 * cuadrícula (DESIGN.md §4, excepción documentada).
 */
export function CalendarioMes({
  dias,
  eventosPorFecha,
  hoy,
  puedeEditar,
  paraCocina = false,
  ausencias = [],
}: {
  dias: DiaConEtiqueta[]
  eventosPorFecha: Record<FechaISO, Evento[]>
  hoy: FechaISO
  puedeEditar: boolean
  /** Administración: solo ve lo que debe preparar la cocina (sin título ni tipo). */
  paraCocina?: boolean
  /** Ausencias propias (Director y Residente): sus días se marcan en la cuadrícula. */
  ausencias?: readonly RangoAusencia[]
}) {
  const [fechaAbierta, setFechaAbierta] = useState<FechaISO | null>(null)
  const [vista, setVista] = useState<'lista' | 'mes'>('lista')
  const diaAbierto = dias.find((d) => d.fecha === fechaAbierta) ?? null
  const conEventos = dias.filter((dia) => dia.enMes && (eventosPorFecha[dia.fecha]?.length ?? 0) > 0)

  return (
    <div className="calendario" data-vista={vista}>
      <div className="cal-alternar">
        <button type="button" className="btn ghost" onClick={() => setVista(vista === 'lista' ? 'mes' : 'lista')}>
          {vista === 'lista' ? 'Ver mes' : 'Ver lista'}
        </button>
      </div>

      <div className="agenda">
        {conEventos.length === 0 ? (
          <div className="empty-state">
            {paraCocina ? 'No hay nada para la cocina este mes.' : 'No hay eventos este mes.'}
            {puedeEditar && ' Para agregar uno, tocá «Ver mes» y elegí el día.'}
          </div>
        ) : (
          <ul className="agenda-lista">
            {conEventos.map((dia) => {
              const eventos = eventosPorFecha[dia.fecha] ?? []
              return (
                <li key={dia.fecha}>
                  <button
                    type="button"
                    className={`agenda-dia${dia.fecha === hoy ? ' today' : ''}`}
                    aria-current={dia.fecha === hoy ? 'date' : undefined}
                    onClick={() => setFechaAbierta(dia.fecha)}
                  >
                    <span className="agenda-fecha">
                      {dia.etiqueta}
                      {dia.fecha === hoy && <span className="etiqueta-hoy">Hoy</span>}
                    </span>
                    {eventos.map((evento) => (
                      <span key={evento.id} className="agenda-evento">
                        {textoEvento(evento)}
                        <InsigniasEvento evento={evento} />
                      </span>
                    ))}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="cal-grid">
        {DIAS_SEMANA_CORTOS.map((nombre) => (
          <div key={nombre} className="cal-dow">
            {nombre}
          </div>
        ))}
        {dias.map((dia) => {
          const eventos = eventosPorFecha[dia.fecha] ?? []
          const esHoy = dia.fecha === hoy
          const ausente = estaAusente(ausencias, dia.fecha)
          const clases = [
            'cal-day',
            dia.enMes ? '' : 'other-month',
            esHoy ? 'today' : '',
            eventos.length ? 'con-eventos' : '',
            ausente ? 'ausente' : '',
          ]
            .filter(Boolean)
            .join(' ')
          return (
            <button
              key={dia.fecha}
              type="button"
              className={clases}
              data-fecha={dia.fecha}
              aria-label={etiquetaAccesible(dia, eventos.length, paraCocina, ausente)}
              aria-current={esHoy ? 'date' : undefined}
              onClick={() => setFechaAbierta(dia.fecha)}
            >
              <span className="daynum">{dia.dia}</span>
              {ausente && <Icono nombre="ausencia" className="cal-ausente-icono" />}
              {eventos.map((evento) => (
                <span key={evento.id} className="cal-event">
                  {textoEvento(evento)}
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
          paraCocina={paraCocina}
          ausente={estaAusente(ausencias, diaAbierto.fecha)}
          alCerrar={() => setFechaAbierta(null)}
        />
      )}
    </div>
  )
}
