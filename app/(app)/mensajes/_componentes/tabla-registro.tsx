import { LIMITE_REGISTRO, type EntradaRegistro } from '@/lib/mensajes/consultas'
import { fechaHoraLocal } from '@/lib/mensajes/tiempo'
import type { PerfilResumen } from '@/lib/perfiles/consultas'

export function TablaRegistro({ entradas, perfiles }: { entradas: EntradaRegistro[]; perfiles: PerfilResumen[] }) {
  const nombres = new Map(perfiles.map((p) => [p.id, p.nombre]))

  if (entradas.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">Todavía no se eliminó ningún mensaje de otra persona.</div>
      </div>
    )
  }

  return (
    <div className="card">
      <p className="desc" style={{ marginBottom: 12 }}>
        Mensajes de otras personas eliminados por un Director (últimos {LIMITE_REGISTRO}).
      </p>
      <div className="admin-table-scroll">
        <table className="user-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Eliminado por</th>
              <th>Autor</th>
              <th>Tipo</th>
              <th>Texto</th>
            </tr>
          </thead>
          <tbody>
            {entradas.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{fechaHoraLocal(e.eliminado_en)}</td>
                <td>{nombres.get(e.moderador_id) ?? '—'}</td>
                <td>{nombres.get(e.autor_id) ?? '—'}</td>
                <td>{e.era_respuesta ? 'Respuesta' : 'Publicación'}</td>
                <td style={{ whiteSpace: 'pre-wrap' }}>{e.texto_eliminado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
