'use client'

import { useId } from 'react'
import type { FechaISO } from '@/lib/fechas'

const ETIQUETA_DIA_SEMANA = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const ETIQUETA_ORDINAL: Record<string, string> = { '1': 'Primer', '2': 'Segundo', '3': 'Tercer', '4': 'Cuarto', '-1': 'Último' }

export type Patron = 'semanal' | 'mensual_dia_fijo' | 'mensual_dia_semana'

function ErrorCampo({ mensaje }: { mensaje?: string }) {
  return mensaje ? <div className="campo-error">{mensaje}</div> : null
}

export function CamposRecurrencia({
  patron,
  alCambiarPatron,
  diaSemana,
  alCambiarDiaSemana,
  ordinalSemana,
  alCambiarOrdinalSemana,
  diaMes,
  alCambiarDiaMes,
  fechaFin,
  alCambiarFechaFin,
  errores,
}: {
  patron: Patron
  alCambiarPatron: (p: Patron) => void
  diaSemana: string
  alCambiarDiaSemana: (v: string) => void
  ordinalSemana: string
  alCambiarOrdinalSemana: (v: string) => void
  diaMes: string
  alCambiarDiaMes: (v: string) => void
  fechaFin: FechaISO | ''
  alCambiarFechaFin: (v: string) => void
  errores?: Record<string, string>
}) {
  const id = useId()

  return (
    <fieldset className="grupo-campo">
      <legend>¿Cómo se repite?</legend>
      <div className="field">
        <label htmlFor={`${id}-patron`}>Patrón</label>
        <select id={`${id}-patron`} name="patron" value={patron} onChange={(e) => alCambiarPatron(e.target.value as Patron)}>
          <option value="semanal">Cada semana, el mismo día</option>
          <option value="mensual_dia_fijo">Cada mes, el mismo día del mes</option>
          <option value="mensual_dia_semana">Cada mes, el mismo día de la semana (ej. el primer lunes)</option>
        </select>
      </div>

      {patron !== 'mensual_dia_fijo' && (
        <div className="field">
          <label htmlFor={`${id}-dia-semana`}>Día de la semana</label>
          <select id={`${id}-dia-semana`} name="dia_semana" value={diaSemana} onChange={(e) => alCambiarDiaSemana(e.target.value)}>
            <option value="">Elegí un día</option>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <option key={d} value={d}>
                {ETIQUETA_DIA_SEMANA[d]}
              </option>
            ))}
          </select>
          <ErrorCampo mensaje={errores?.dia_semana} />
        </div>
      )}

      {patron === 'mensual_dia_semana' && (
        <div className="field">
          <label htmlFor={`${id}-ordinal`}>Cuál</label>
          <select id={`${id}-ordinal`} name="ordinal_semana" value={ordinalSemana} onChange={(e) => alCambiarOrdinalSemana(e.target.value)}>
            <option value="">Elegí una opción</option>
            {['1', '2', '3', '4', '-1'].map((o) => (
              <option key={o} value={o}>
                {ETIQUETA_ORDINAL[o]}
              </option>
            ))}
          </select>
          <ErrorCampo mensaje={errores?.ordinal_semana} />
        </div>
      )}

      {patron === 'mensual_dia_fijo' && (
        <div className="field">
          <label htmlFor={`${id}-dia-mes`}>Día del mes</label>
          <input id={`${id}-dia-mes`} name="dia_mes" type="number" min={1} max={31} value={diaMes} onChange={(e) => alCambiarDiaMes(e.target.value)} />
          <ErrorCampo mensaje={errores?.dia_mes} />
        </div>
      )}

      <div className="field">
        <label htmlFor={`${id}-fecha-fin`}>Repetir hasta</label>
        <input id={`${id}-fecha-fin`} name="fecha_fin" type="date" required value={fechaFin} onChange={(e) => alCambiarFechaFin(e.target.value)} />
        <ErrorCampo mensaje={errores?.fecha_fin} />
      </div>
    </fieldset>
  )
}
