'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Icono } from '@/components/ui/iconos'
import { estaAusente, type RangoAusencia } from '@/lib/ausencias/tipos'
import { DIAS_SEMANA_CORTOS, mesAnterior, mesDe, mesSiguiente, type MesISO } from '@/lib/calendario/cuadricula'
import {
  enSeleccion,
  extremoDeSeleccion,
  focoInicial,
  moverFoco,
  puedeIrAlMes,
  semanasDelMes,
  type SeleccionRango,
} from '@/lib/calendario/seleccion-rango'
import type { FechaISO } from '@/lib/fechas'
import { DIAS_SEMANA, etiquetaDiaLarga, etiquetaMesLarga } from '@/lib/fechas/etiquetas'

function etiquetaAccesible(fecha: FechaISO, esHoy: boolean, ausente: boolean): string {
  return `${etiquetaDiaLarga(fecha)}${esHoy ? ', hoy' : ''}${ausente ? ', ya marcado como ausente' : ''}`
}

/**
 * Mes chico para elegir un rango tocando el primer y el último día (patrón APG de selector de
 * fecha: un solo punto de tabulación y flechas, Inicio/Fin, RePág/AvPág). No decide nada: la
 * selección la guarda quien lo usa (`alTocar`) y la lógica vive en lib/calendario/seleccion-rango.ts.
 *
 * Los días miden ~39px de ancho en un teléfono de 375px: excepción táctil documentada en DESIGN.md
 * §4, con alto completo de 56px y el rango siempre escrito fuera del calendario antes de guardar.
 *
 * Clases propias (`.mini-dia`), nunca `.cal-day`: los E2E del calendario grande buscan
 * `.cal-day[data-fecha=…]` como único.
 */
export function MiniCalendario({
  hoy,
  min,
  max,
  ausencias,
  seleccion,
  alTocar,
  mesInicial,
}: {
  /** Viene del servidor: el navegador nunca calcula "hoy". */
  hoy: FechaISO
  /** Primer y último día que se pueden tocar; los de afuera quedan deshabilitados. */
  min: FechaISO
  max: FechaISO
  /** Días ya ausentes de la persona: se marcan, y se pueden volver a tocar. */
  ausencias: readonly RangoAusencia[]
  seleccion: SeleccionRango
  alTocar: (fecha: FechaISO) => void
  /** Mes que se muestra al abrir. Por omisión, el del primer día elegido o el de hoy. */
  mesInicial?: MesISO
}) {
  const idTitulo = useId()
  const [mes, setMes] = useState<MesISO>(() => mesInicial ?? mesDe(seleccion.desde ?? (hoy < min ? min : hoy)))
  const [foco, setFoco] = useState<FechaISO | null>(null)
  const tabla = useRef<HTMLTableElement>(null)
  // El teclado puede llevar el foco a otro mes: primero se pinta ese mes, después se enfoca el día.
  const enfocarTrasPintar = useRef(false)

  const elegible = (f: FechaISO) => min <= f && f <= max
  const tabulable = foco !== null && mesDe(foco) === mes && elegible(foco) ? foco : focoInicial(mes, { seleccion, hoy, min, max })
  const navegacion = puedeIrAlMes(mes, min, max)

  useEffect(() => {
    if (!enfocarTrasPintar.current || foco === null) return
    enfocarTrasPintar.current = false
    tabla.current?.querySelector<HTMLButtonElement>(`[data-fecha="${foco}"]`)?.focus()
  }, [foco, mes])

  function alTeclear(evento: KeyboardEvent<HTMLButtonElement>, fecha: FechaISO) {
    const destino = moverFoco(fecha, evento.key, min, max)
    if (destino === null) return
    evento.preventDefault()
    if (destino === fecha) return
    enfocarTrasPintar.current = true
    setFoco(destino)
    setMes(mesDe(destino))
  }

  return (
    <div className="mini-calendario" data-mes={mes}>
      <div className="mini-cabeza">
        <button
          type="button"
          className="icon-btn"
          aria-label="Ir al mes anterior"
          // aria-disabled y no disabled: en el primer mes el botón conserva el foco del teclado.
          aria-disabled={navegacion.anterior ? undefined : true}
          onClick={() => navegacion.anterior && setMes(mesAnterior(mes))}
        >
          <Icono nombre="izquierda" />
        </button>
        <div id={idTitulo} className="mini-mes" aria-live="polite">
          {etiquetaMesLarga(mes)}
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label="Ir al mes siguiente"
          aria-disabled={navegacion.siguiente ? undefined : true}
          onClick={() => navegacion.siguiente && setMes(mesSiguiente(mes))}
        >
          <Icono nombre="derecha" />
        </button>
      </div>
      <table ref={tabla} role="grid" aria-labelledby={idTitulo} className="mini-tabla">
        <thead>
          <tr>
            {DIAS_SEMANA_CORTOS.map((corto, i) => (
              // Nunca por debajo de la letra mínima (DESIGN.md §4): si "Mié" no cabe a ese tamaño en la
              // columna, se ve la inicial (CSS, consulta de contenedor). El lector oye siempre el nombre entero.
              <th key={corto} scope="col" abbr={DIAS_SEMANA[i]}>
                <span className="sr-only">{DIAS_SEMANA[i]}</span>
                <span className="dia-corto" aria-hidden="true">
                  {corto}
                </span>
                <span className="dia-inicial" aria-hidden="true">
                  {DIAS_SEMANA[i].charAt(0)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanasDelMes(mes).map((semana) => (
            <tr key={semana.find((f) => f !== null)}>
              {semana.map((fecha, i) => {
                // Días de otros meses: celda vacía que conserva las siete columnas.
                if (fecha === null) return <td key={i} />
                const esHoy = fecha === hoy
                const ausente = estaAusente(ausencias, fecha)
                const elegido = enSeleccion(seleccion, fecha)
                const clases = [
                  'mini-dia',
                  ausente ? 'marcado' : '',
                  elegido ? 'elegido' : '',
                  extremoDeSeleccion(seleccion, fecha) ? 'extremo' : '',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  // La selección va en la celda (aria-selected, patrón APG de selector de fecha) y no
                  // como aria-pressed en el botón: tocar un día elegido no lo suelta, empieza otro rango.
                  <td key={fecha} aria-selected={elegido || undefined}>
                    <button
                      type="button"
                      className={clases}
                      data-fecha={fecha}
                      tabIndex={fecha === tabulable ? 0 : -1}
                      aria-label={etiquetaAccesible(fecha, esHoy, ausente)}
                      aria-current={esHoy ? 'date' : undefined}
                      disabled={!elegible(fecha)}
                      onClick={() => {
                        setFoco(fecha)
                        alTocar(fecha)
                      }}
                      onKeyDown={(evento) => alTeclear(evento, fecha)}
                    >
                      <span className="mini-num">{Number(fecha.slice(8, 10))}</span>
                      {ausente && <Icono nombre="ausencia" className="mini-icono" />}
                    </button>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
