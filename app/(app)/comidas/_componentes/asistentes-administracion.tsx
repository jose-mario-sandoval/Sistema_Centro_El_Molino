import { Icono } from '@/components/ui/iconos'
import { ORDEN_COCINA, type AsistenteComida } from '@/lib/comidas/resumen'
import { INFO_ESTADO } from '@/lib/comidas/tipos'
import { varsEstado } from './insignia-estado'

/** La lista no recibe nombres ni IDs. Las notas generales y puntuales llevan rótulos distintos. */
export function AsistentesAdministracion({ asistentes }: { asistentes?: readonly AsistenteComida[] }) {
  if (!asistentes?.length) return null
  return (
    <details className="asistentes-admin">
      <summary><Icono nombre="comidas" />Quiénes comen ({asistentes.length})</summary>
      <div className="asistentes-contenido">
        {ORDEN_COCINA.map((estado) => {
          if (estado === 'sin_definir' || estado === 'no') return null
          const grupo = asistentes.filter((persona) => persona.estado === estado)
          if (grupo.length === 0) return null
          return (
            <div key={estado} className="asistentes-grupo">
              <p className="asistentes-estado" style={varsEstado(estado)}>
                <Icono nombre={estado} />{INFO_ESTADO[estado].etiqueta} ({grupo.length})
              </p>
              <ul>
                {grupo.map((persona, indice) => (
                  <li key={indice}>
                    <strong>{persona.siglas}</strong>
                    {persona.nota && <p className="asistente-nota">{INFO_ESTADO[estado].nota === 'hora' ? 'Hora' : 'Nota de esta comida'}: {persona.nota}</p>}
                    {persona.notaDieta && <p className="asistente-nota"><strong>Notas de dieta:</strong> {persona.notaDieta}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </details>
  )
}
