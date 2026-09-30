'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { Icono } from '@/components/ui/iconos'
import { estaAusente, type RangoAusencia } from '@/lib/ausencias/tipos'
import { DIAS_SEMANA_CORTOS, type DiaConEtiqueta } from '@/lib/calendario/cuadricula'
import { etiquetaDiaCalendario, filtrarEventos, textoCantidadOcultos } from '@/lib/calendario/filtros'
import { INICIAL_TIPO, MARCA_TIPO, tienePedido, varsTipo, type Evento } from '@/lib/calendario/tipos'
import { horaHHMM, type FechaISO } from '@/lib/fechas'
import { FiltrosCalendario } from './filtros-calendario'
import { InsigniasEvento } from './insignias-evento'
import { ModalDia } from './modal-dia'
import { useFiltrosCalendario } from './usar-filtros'

function textoEvento(evento: Evento): string {
  return `${evento.hora ? `${horaHHMM(evento.hora)} ` : ''}${evento.titulo}`
}

/**
 * Color, marca y datos para el CSS previo a la hidratación (`data-tipo`, `data-pedido`). Solo si el
 * evento trae tipo: los de Administración no lo traen y se pintan como siempre, sin nada de esto.
 */
function atributosEvento(evento: Evento) {
  if (evento.tipo === null) return {}
  return {
    'data-tipo': evento.tipo,
    'data-marca': MARCA_TIPO[evento.tipo],
    'data-inicial': INICIAL_TIPO[evento.tipo] || undefined,
    'data-pedido': tienePedido(evento) ? undefined : 'no',
    style: varsTipo(evento.tipo),
  }
}

const SIN_EVENTOS = { visibles: [] as Evento[], ocultos: 0 }

/** Ojo tachado + cuántos: el día tiene eventos ocultos por los filtros, no está vacío. */
function OcultosDelDia({ cantidad }: { cantidad: number }) {
  return (
    <span className="cal-ocultos" aria-hidden="true">
      <Icono nombre="oculto" />
      {cantidad}
      <span className="cal-ocultos-palabra">{cantidad === 1 ? ' oculto' : ' ocultos'}</span>
    </span>
  )
}

/**
 * En el teléfono, siete columnas dejan días de ~40px, que no se pueden tocar con seguridad: por
 * eso ahí abre en lista (agenda) y la cuadrícula queda a un toque. En escritorio, siempre la
 * cuadrícula (DESIGN.md §4, excepción documentada).
 *
 * Con `conFiltros` (Director y Residente), arriba van los filtros por tipo, "Mis ausencias" y "Solo
 * eventos con pedido a cocina", y el aviso de lo que está oculto. Administración no los tiene: sus
 * eventos no traen tipo (ni color, ni marca).
 */
export function CalendarioMes({
  cabecera,
  dias,
  eventosPorFecha,
  hoy,
  puedeEditar,
  paraCocina = false,
  ausencias = [],
  conFiltros = false,
}: {
  /** El mes y sus flechas: va dentro de la tarjeta, debajo de los filtros. */
  cabecera?: ReactNode
  dias: DiaConEtiqueta[]
  eventosPorFecha: Record<FechaISO, Evento[]>
  hoy: FechaISO
  puedeEditar: boolean
  /** Administración: solo ve lo que debe preparar la cocina (sin título ni tipo). */
  paraCocina?: boolean
  /** Ausencias propias (Director y Residente): sus días se marcan en la cuadrícula. */
  ausencias?: readonly RangoAusencia[]
  conFiltros?: boolean
}) {
  const [fechaAbierta, setFechaAbierta] = useState<FechaISO | null>(null)
  const [vista, setVista] = useState<'lista' | 'mes'>('lista')
  const { ocultos, listo, alternar, mostrarTodo } = useFiltrosCalendario(conFiltros)
  const marcarAusencias = !ocultos.includes('ausencias')

  const porFecha = useMemo(() => {
    const resultado: Record<FechaISO, { visibles: Evento[]; ocultos: number }> = {}
    for (const [fecha, eventos] of Object.entries(eventosPorFecha)) resultado[fecha] = filtrarEventos(eventos, ocultos)
    return resultado
  }, [eventosPorFecha, ocultos])

  const diaAbierto = dias.find((d) => d.fecha === fechaAbierta) ?? null
  const delMes = dias.filter((dia) => dia.enMes)
  const conEventos = delMes.filter((dia) => (porFecha[dia.fecha]?.visibles.length ?? 0) > 0)
  const ocultosDelMes = delMes.reduce((suma, dia) => suma + (porFecha[dia.fecha]?.ocultos ?? 0), 0)

  return (
    // data-listo: ya hidratado con los filtros de este dispositivo (antes, el CSS esconde lo guardado).
    <div className="zona-calendario" data-listo={listo ? '' : undefined}>
      {conFiltros && <FiltrosCalendario ocultos={ocultos} alAlternar={alternar} alMostrarTodo={mostrarTodo} />}
      <div className="card">
        {cabecera}
        <div className="calendario" data-vista={vista}>
          <div className="cal-alternar">
            <button type="button" className="btn ghost" onClick={() => setVista(vista === 'lista' ? 'mes' : 'lista')}>
              {vista === 'lista' ? 'Ver mes' : 'Ver lista'}
            </button>
          </div>

          <div className="agenda">
            {conEventos.length === 0 ? (
              <div className="empty-state">
                {ocultosDelMes > 0
                  ? `No hay eventos a la vista este mes: ${textoCantidadOcultos(ocultosDelMes)}.`
                  : paraCocina
                    ? 'No hay nada para la cocina este mes.'
                    : 'No hay eventos este mes.'}
                {puedeEditar && ' Para agregar uno, tocá «Ver mes» y elegí el día.'}
              </div>
            ) : (
              <ul className="agenda-lista">
                {conEventos.map((dia) => {
                  const { visibles, ocultos: ocultosDia } = porFecha[dia.fecha] ?? SIN_EVENTOS
                  const ausente = marcarAusencias && estaAusente(ausencias, dia.fecha)
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
                          {ausente && (
                            <span className="etiqueta-ausente">
                              <Icono nombre="ausencia" />
                              Ausente
                            </span>
                          )}
                        </span>
                        {visibles.map((evento) => (
                          <span key={evento.id} className="agenda-evento" {...atributosEvento(evento)}>
                            {textoEvento(evento)}
                            <InsigniasEvento evento={evento} />
                          </span>
                        ))}
                        {ocultosDia > 0 && (
                          <span className="agenda-ocultos">
                            <Icono nombre="oculto" />+{textoCantidadOcultos(ocultosDia)}
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {conEventos.length > 0 && ocultosDelMes > 0 && (
              <p className="agenda-ocultos-mes">
                <Icono nombre="oculto" />
                Este mes: {textoCantidadOcultos(ocultosDelMes)}.
              </p>
            )}
          </div>

          <div className="cal-grid">
            {DIAS_SEMANA_CORTOS.map((nombre) => (
              <div key={nombre} className="cal-dow">
                <span className="dia-corto">{nombre}</span>
                <span className="dia-inicial" aria-hidden="true">
                  {nombre[0]}
                </span>
              </div>
            ))}
            {dias.map((dia) => {
              const { visibles, ocultos: ocultosDia } = porFecha[dia.fecha] ?? SIN_EVENTOS
              const esHoy = dia.fecha === hoy
              const ausente = marcarAusencias && estaAusente(ausencias, dia.fecha)
              const clases = [
                'cal-day',
                dia.enMes ? '' : 'other-month',
                esHoy ? 'today' : '',
                visibles.length ? 'con-eventos' : '',
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
                  aria-label={etiquetaDiaCalendario({ etiqueta: dia.etiqueta, visibles, ocultos: ocultosDia, paraCocina, ausente })}
                  aria-current={esHoy ? 'date' : undefined}
                  onClick={() => setFechaAbierta(dia.fecha)}
                >
                  <span className="daynum">{dia.dia}</span>
                  {ausente && <Icono nombre="ausencia" className="cal-ausente-icono" />}
                  {visibles.map((evento) => (
                    <span key={evento.id} className="cal-event" {...atributosEvento(evento)}>
                      {textoEvento(evento)}
                    </span>
                  ))}
                  {ocultosDia > 0 && <OcultosDelDia cantidad={ocultosDia} />}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      {diaAbierto && (
        <ModalDia
          dia={diaAbierto}
          eventos={eventosPorFecha[diaAbierto.fecha] ?? []}
          ocultos={ocultos}
          puedeEditar={puedeEditar}
          paraCocina={paraCocina}
          ausente={estaAusente(ausencias, diaAbierto.fecha)}
          alCerrar={() => setFechaAbierta(null)}
        />
      )}
    </div>
  )
}
