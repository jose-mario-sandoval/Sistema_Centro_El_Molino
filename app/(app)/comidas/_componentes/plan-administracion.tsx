import { NOMBRES_DIA } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA } from '@/lib/comidas/tipos'
import type { PersonaConPlan } from '@/lib/comidas/vista'
import { InsigniaEstado } from './insignia-estado'

export function PlanAdministracion({ personas }: { personas: PersonaConPlan[] }) {
  return (
    <>
      <div className="locked-banner">Vista de solo lectura. Cada persona define su propio patrón habitual de comidas.</div>
      <div className="card admin-table-scroll">
        {personas.length === 0 ? (
          <div className="empty-state">No hay Directores ni Residentes activos.</div>
        ) : (
          <table className="admin-week-table">
            <thead>
              <tr>
                <th scope="col">Persona</th>
                {NOMBRES_DIA.map((nombre) => (
                  <th key={nombre} scope="col">
                    {nombre.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {personas.map((persona) => (
                <tr key={persona.id}>
                  <td className="namecell">{persona.nombre}</td>
                  {NOMBRES_DIA.map((nombre, i) => (
                    <td key={nombre}>
                      {TIEMPOS_COMIDA.map((comida) => (
                        <div key={comida} className="plan-linea">
                          <span className="plan-letra" title={ETIQUETA_TIEMPO[comida]}>
                            {ETIQUETA_TIEMPO[comida].charAt(0)}:
                          </span>
                          <InsigniaEstado valor={persona.plan[i + 1]?.[comida] ?? null} />
                        </div>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
