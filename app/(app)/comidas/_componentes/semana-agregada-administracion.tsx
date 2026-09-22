import { totalQueComen } from '@/lib/comidas/resumen'
import { fechaCorta, nombreDia } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA, type TiempoComida } from '@/lib/comidas/tipos'
import type { DiaAgregado } from '@/lib/comidas/vista'

/** La hoja desde la que se cocina: cuánto preparar cada día, nunca para quién. */
export function SemanaAgregadaAdministracion({
  dias,
  extras,
}: {
  dias: DiaAgregado[]
  extras: Record<string, Partial<Record<TiempoComida, number>>>
}) {
  return (
    <div className="card admin-table-scroll">
      <div className="section-title">Cantidades de la semana</div>
      <table className="admin-week-table">
        <thead>
          <tr>
            <th scope="col">Comida</th>
            {dias.map((dia) => (
              <th key={dia.fecha} scope="col">
                {nombreDia(dia.fecha).slice(0, 3)} {fechaCorta(dia.fecha)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TIEMPOS_COMIDA.map((comida) => (
            <tr key={comida}>
              <th scope="row">{ETIQUETA_TIEMPO[comida]}</th>
              {dias.map((dia) => {
                const extra = extras[dia.fecha]?.[comida]
                return (
                  <td key={dia.fecha} data-et={`${ETIQUETA_TIEMPO[comida]} ${fechaCorta(dia.fecha)}`}>
                    <div className="conteo-numero">{totalQueComen(dia.resumen[comida])}</div>
                    {extra ? <div className="status-note">+{extra} extra</div> : null}
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
