import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA } from '@/lib/comidas/tipos'
import { totalQueComen, type ResumenComida } from '@/lib/comidas/resumen'
import { NOMBRES_DIA } from '@/lib/comidas/semana'

export function PlanAgregadoAdministracion({ resumenSemana }: { resumenSemana: Record<number, Record<string, ResumenComida>> }) {
  return (
    <>
      <div className="locked-banner">Vista de solo lectura. Cantidades del patrón habitual de la casa.</div>
      <div className="card admin-table-scroll">
        <table className="admin-week-table">
          <thead>
            <tr>
              <th scope="col">Comida</th>
              {NOMBRES_DIA.map((nombre) => (
                <th key={nombre} scope="col">
                  {nombre.slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIEMPOS_COMIDA.map((comida) => (
              <tr key={comida}>
                <th scope="row">{ETIQUETA_TIEMPO[comida]}</th>
                {NOMBRES_DIA.map((nombre, i) => (
                  <td key={nombre} data-et={nombre}>
                    {totalQueComen(resumenSemana[i + 1][comida])}
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
