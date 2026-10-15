import { type ResumenComida } from '@/lib/comidas/resumen'
import { NOMBRES_DIA } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA, type TiempoComida } from '@/lib/comidas/tipos'
import { CeldaResumen } from './celda-resumen'
import { AsistentesAdministracion } from './asistentes-administracion'

/** El patrón habitual de la casa: mismo desglose que la Semana, con asistentes por siglas. */
export function PlanAgregadoAdministracion({
  resumenSemana,
}: {
  /** resumenSemana[díaDeSemana 1..7][comida] */
  resumenSemana: Record<number, Record<TiempoComida, ResumenComida>>
}) {
  return (
    <>
      <div className="locked-banner">Vista de solo lectura. Cantidades y siglas del plan habitual; los cambios y ausencias de una semana se consultan en Semana.</div>
      <div className="card admin-table-scroll">
        <table className="admin-week-table">
          <thead>
            <tr>
              <th scope="col">Día</th>
              {TIEMPOS_COMIDA.map((comida) => (
                <th key={comida} scope="col">
                  {ETIQUETA_TIEMPO[comida]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOMBRES_DIA.map((nombre, indice) => (
              <tr key={nombre}>
                <th scope="row" className="namecell">
                  {nombre}
                </th>
                {TIEMPOS_COMIDA.map((comida) => (
                  <td key={comida} data-dia={indice + 1} data-comida={comida} data-et={ETIQUETA_TIEMPO[comida]}>
                    <CeldaResumen resumen={resumenSemana[indice + 1][comida]} />
                    <AsistentesAdministracion asistentes={resumenSemana[indice + 1][comida].asistentes} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
