import Link from 'next/link'
import { Icono } from '@/components/ui/iconos'
import type { TipoSemana } from '@/lib/comidas/semana'
import type { DiaDeSemana } from '@/lib/comidas/vista'
import { sumarDias, type FechaISO } from '@/lib/fechas'
import { ComidaDelDia } from './comida-del-dia'

function Dia({ dia }: { dia: DiaDeSemana }) {
  const etiqueta = `${dia.nombre} ${dia.fechaCorta}`
  return (
    <section className={`day-row${dia.esHoy ? ' today' : ''}`} aria-label={etiqueta}>
      <div className="day-row-top">
        <div className="day-title">
          <span className="dname">{dia.nombre}</span>
          <span className="ddate">{dia.fechaCorta}</span>
        </div>
        {dia.esHoy && <span className="etiqueta-hoy">Hoy</span>}
        {dia.ausente && (
          <span className="etiqueta-ausente">
            <Icono nombre="ausencia" />
            Ausente
          </span>
        )}
      </div>
      {dia.comidas.map((comida) => (
        <ComidaDelDia key={comida.comida} fecha={dia.fecha} dia={dia.nombre} etiquetaDia={etiqueta} datos={comida} />
      ))}
    </section>
  )
}

export function SemanaPersona({ dias, tipo, lunes }: { dias: DiaDeSemana[]; tipo: TipoSemana; lunes: FechaISO }) {
  // Semana en curso: lo primero en pantalla es algo que todavía se puede cambiar. Un domingo, seis
  // de siete días ya cerraron; sin este orden habría que pasar por todos ellos para llegar a hoy.
  const indiceHoy = tipo === 'actual' ? dias.findIndex((dia) => dia.esHoy) : -1
  const desdeHoy = indiceHoy > 0 ? dias.slice(indiceHoy) : dias
  const anteriores = indiceHoy > 0 ? dias.slice(0, indiceHoy) : []
  const quedan = indiceHoy >= 0 ? 6 - indiceHoy : null

  return (
    <>
      {tipo === 'pasada' && (
        <div className="locked-banner">Semana pasada: solo consulta. Podés cambiar la semana actual y la siguiente.</div>
      )}
      <div className="week-list">
        {desdeHoy.map((dia) => (
          <Dia key={dia.fecha} dia={dia} />
        ))}

        {/* "Mañana" nunca se esconde detrás de la paginación: cada domingo es la semana siguiente. */}
        {tipo === 'actual' && (
          <Link href={`/comidas/semana?semana=${sumarDias(lunes, 7)}`} className="siguiente-semana">
            <span>
              <span className="siguiente-semana-titulo">Ver la semana que viene</span>
              <span className="hint">
                {quedan === 0
                  ? 'Hoy es el último día de esta semana. Mañana ya es la siguiente.'
                  : 'Ya podés elegir tus comidas de la próxima semana.'}
              </span>
            </span>
            <Icono nombre="derecha" />
          </Link>
        )}

        {anteriores.length > 0 && (
          <details className="dias-pasados">
            <summary>
              <Icono nombre="abajo" />
              <span>
                Días anteriores de esta semana ({anteriores.length})
              </span>
            </summary>
            {anteriores.map((dia) => (
              <Dia key={dia.fecha} dia={dia} />
            ))}
          </details>
        )}
      </div>
    </>
  )
}
