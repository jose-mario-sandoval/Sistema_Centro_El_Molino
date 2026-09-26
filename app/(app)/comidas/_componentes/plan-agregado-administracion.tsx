import { type ResumenComida } from '@/lib/comidas/resumen'
import { NOMBRES_DIA } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA, type TiempoComida } from '@/lib/comidas/tipos'
import { CeldaResumen } from './celda-resumen'

/** El patrón habitual de la casa, agregado: mismo desglose que la Semana, sin nombres. */
export function PlanAgregadoAdministracion({
  resumenSemana,
}: {
  /** resumenSemana[díaDeSemana 1..7][comida] */
  resumenSemana: Record<number, Record<TiempoComida, ResumenComida>>
}) {
  return (
    <>
      <div className="locked-banner">Vista de solo lectura. Cantidades del patrón habitual de la casa.</div>
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
