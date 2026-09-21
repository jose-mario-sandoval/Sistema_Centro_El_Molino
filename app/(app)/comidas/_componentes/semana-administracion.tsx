import Link from 'next/link'
import { Icono } from '@/components/ui/iconos'
import type { ParteResumen } from '@/lib/comidas/resumen'
import { diasDeSemana, etiquetaDia, fechaCorta, nombreDia } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA, type TiempoComida } from '@/lib/comidas/tipos'
import type { DiaAdministracion } from '@/lib/comidas/vista'
import type { FechaISO } from '@/lib/fechas'
import { InsigniaEstado, varsEstado } from './insignia-estado'
import { RefrescarAlVolver } from './refrescar-al-volver'

function Parte({ parte }: { parte: ParteResumen }) {
  if (parte.clave === 'sin_definir')
    return (
      <li className="parte sin-definir">
        <Icono nombre="sinDefinir" />
        {parte.texto}
      </li>
    )
  return (
    <li className="parte" style={varsEstado(parte.clave)}>
      <Icono nombre={parte.clave} />
      {parte.texto}
    </li>
  )
}

/** La hoja desde la que se cocina: primero a quién hay que preguntarle, después cuántos platos. */
export function SemanaAdministracion({ lunes, hoy, datos }: { lunes: FechaISO; hoy: FechaISO; datos: DiaAdministracion }) {
  const faltan = datos.filas
    .map((fila) => ({
      nombre: fila.nombre,
      comidas: TIEMPOS_COMIDA.filter((comida) => !fila.valores[comida]).map((c) => ETIQUETA_TIEMPO[c].toLowerCase()),
    }))
    .filter((persona) => persona.comidas.length > 0)

  function comen(comida: TiempoComida): number {
    return datos.filas.filter((fila) => {
      const valor = fila.valores[comida]
      return valor !== null && valor.estado !== 'no'
    }).length
  }

  return (
    <>
      <RefrescarAlVolver />

      <nav className="selector-dia" aria-label="Día">
        {diasDeSemana(lunes).map((fecha) => {
          const elegido = fecha === datos.fecha
          return (
            <Link
              key={fecha}
              href={`/comidas/semana?semana=${lunes}&dia=${fecha}`}
              className={`chip-dia${elegido ? ' selected' : ''}`}
              aria-current={elegido ? 'true' : undefined}
            >
              <span className="chip-dia-nombre">{nombreDia(fecha).slice(0, 3)}</span>{' '}
              <span className="chip-dia-fecha">{fechaCorta(fecha)}</span>
              {fecha === hoy && <span className="chip-dia-hoy"> · hoy</span>}
            </Link>
          )
        })}
      </nav>

      {faltan.length > 0 && (
        <div className="aviso-faltan" role="status">
          <div className="aviso-faltan-titulo">
            <Icono nombre="sinDefinir" />
            Falta definir
          </div>
          <ul>
            {faltan.map((persona) => (
              <li key={persona.nombre}>
                <strong>{persona.nombre}</strong> ({persona.comidas.join(', ')})
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="resumen-comidas">
        {TIEMPOS_COMIDA.map((comida) => {
          const { partes } = datos.resumen[comida]
          const cantidad = comen(comida)
          return (
            <div key={comida} className="card conteo" data-resumen={comida}>
              <div className="section-title">{ETIQUETA_TIEMPO[comida]}</div>
              {partes.length === 0 ? (
                <span className="status-note">Sin personas</span>
              ) : (
                <>
                  <div className="conteo-numero">
                    {cantidad}
                    <span>{cantidad === 1 ? 'persona come' : 'personas comen'}</span>
                  </div>
                  <ul className="partes">
                    {partes.map((parte) => (
                      <Parte key={parte.clave} parte={parte} />
                    ))}
                  </ul>
                </>
              )}
            </div>
          )
        })}
      </div>

      <div className="card admin-table-scroll">
        <div className="section-title">{etiquetaDia(datos.fecha)}: persona por persona</div>
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
                  <th scope="row" className="namecell">
                    {fila.nombre}
                  </th>
                  {TIEMPOS_COMIDA.map((comida) => {
                    const valor = fila.valores[comida]
                    const clase = !valor ? 'sin-definir' : valor.origen === 'persona' ? 'excepcion' : undefined
                    return (
                      // data-et: en el teléfono la tabla se apila y cada celda muestra su comida.
                      <td key={comida} data-comida={comida} data-et={ETIQUETA_TIEMPO[comida]} className={clase}>
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
