import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { ClaveResumen } from '@/lib/comidas/resumen'
import { diasDeSemana, etiquetaDia, fechaCorta, nombreDia } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA } from '@/lib/comidas/tipos'
import type { DiaAdministracion } from '@/lib/comidas/vista'
import type { FechaISO } from '@/lib/fechas'
import { estiloEstado, InsigniaEstado } from './insignia-estado'
import { RefrescarAlVolver } from './refrescar-al-volver'

const ESTILO_SIN_DEFINIR: CSSProperties = { background: 'var(--surface-2)', color: 'var(--danger)' }

function estiloParte(clave: ClaveResumen): CSSProperties {
  return clave === 'sin_definir' ? ESTILO_SIN_DEFINIR : estiloEstado(clave)
}

export function SemanaAdministracion({ lunes, hoy, datos }: { lunes: FechaISO; hoy: FechaISO; datos: DiaAdministracion }) {
  return (
    <>
      <RefrescarAlVolver />

      <nav className="status-row selector-dia" aria-label="Día">
        {diasDeSemana(lunes).map((fecha) => {
          const elegido = fecha === datos.fecha
          return (
            <Link
              key={fecha}
              href={`/comidas/semana?semana=${lunes}&dia=${fecha}`}
              className={`status-chip${elegido ? ' selected' : ''}`}
              aria-current={elegido ? 'date' : undefined}
            >
              {nombreDia(fecha).slice(0, 3)} {fechaCorta(fecha)}
              {fecha === hoy ? ' · hoy' : ''}
            </Link>
          )
        })}
      </nav>

      <div className="resumen-comidas">
        {TIEMPOS_COMIDA.map((comida) => {
          const { partes } = datos.resumen[comida]
          return (
            <div key={comida} className="card" data-resumen={comida}>
              <div className="section-title">{ETIQUETA_TIEMPO[comida]}</div>
              <div className="status-row">
                {partes.length === 0 ? (
                  <span className="status-note">Sin personas</span>
                ) : (
                  partes.map((parte) => (
                    <span key={parte.clave} className="status-badge" style={estiloParte(parte.clave)}>
                      {parte.texto}
                    </span>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="card admin-table-scroll">
        <div className="section-title">{etiquetaDia(datos.fecha)}: selección por persona</div>
        {datos.filas.length === 0 ? (
          <div className="empty-state">No hay Directores ni Residentes activos.</div>
        ) : (
          <table className="admin-week-table">
            <thead>
              <tr>
                <th scope="col">Persona</th>
                {TIEMPOS_COMIDA.map((comida) => (
                  <th key={comida} scope="col">
                    {ETIQUETA_TIEMPO[comida]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.filas.map((fila) => (
                <tr key={fila.id}>
                  <td className="namecell">{fila.nombre}</td>
                  {TIEMPOS_COMIDA.map((comida) => {
                    const valor = fila.valores[comida]
                    const clase = !valor ? 'sin-definir' : valor.origen === 'persona' ? 'excepcion' : undefined
                    return (
                      <td key={comida} data-comida={comida} className={clase}>
                        <InsigniaEstado valor={valor} />
                        {valor?.origen === 'persona' && <span className="status-note">cambiada por la persona</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="hint" style={{ marginTop: 12 }}>
        Las celdas resaltadas son cambios respecto del plan semanal. Las selecciones las define cada persona y no se
        editan desde acá.
      </div>
    </>
  )
}
