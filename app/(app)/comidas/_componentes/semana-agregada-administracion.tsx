import { etiquetaDia } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA, type TiempoComida } from '@/lib/comidas/tipos'
import type { DiaAgregado } from '@/lib/comidas/vista'
import { CeldaResumen } from './celda-resumen'
import { AsistentesAdministracion } from './asistentes-administracion'

/**
 * La hoja desde la que se cocina: cuánto preparar cada día y cómo (temprano, tarde, en bolsa…),
 * con asistentes identificados por sus siglas. Un día por fila: siete columnas angostas no admiten el desglose, y en el
 * teléfono cada fila pasa a ser la ficha de un día.
 */
export function SemanaAgregadaAdministracion({
  dias,
  extras,
  notas = {},
}: {
  dias: DiaAgregado[]
  extras: Record<string, Partial<Record<TiempoComida, number>>>
  /** Notas de los extras manuales del Director (notasPorComida): nunca nombres. */
  notas?: Record<string, Partial<Record<TiempoComida, string[]>>>
}) {
  return (
    <div className="card admin-table-scroll">
      <div className="section-title">Comidas de la semana</div>
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
          {dias.map((dia) => (
            <tr key={dia.fecha}>
              <th scope="row" className="namecell">
                {etiquetaDia(dia.fecha)}
              </th>
              {TIEMPOS_COMIDA.map((comida) => (
                // data-et: en el teléfono la tabla se apila y cada celda muestra su comida.
                <td key={comida} data-fecha={dia.fecha} data-comida={comida} data-et={ETIQUETA_TIEMPO[comida]}>
                  <CeldaResumen
                    resumen={dia.resumen[comida]}
                    extra={extras[dia.fecha]?.[comida]}
                    notas={notas[dia.fecha]?.[comida]}
                  />
                  <AsistentesAdministracion asistentes={dia.resumen[comida].asistentes} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
