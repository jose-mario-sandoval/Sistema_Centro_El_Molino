import type { TipoSemana } from '@/lib/comidas/semana'
import type { DiaDeSemana } from '@/lib/comidas/vista'
import { ComidaDelDia } from './comida-del-dia'

export function SemanaPersona({ dias, tipo }: { dias: DiaDeSemana[]; tipo: TipoSemana }) {
  return (
    <>
      {tipo === 'pasada' && (
        <div className="locked-banner">Semana pasada: solo consulta. Podés cambiar la semana actual y la siguiente.</div>
      )}
      <div className="week-list">
        {dias.map((dia) => {
          const etiqueta = `${dia.nombre} ${dia.fechaCorta}`
          return (
            <section key={dia.fecha} className={`day-row${dia.esHoy ? ' today' : ''}`} aria-label={etiqueta}>
              <div className="day-row-top">
                <div className="day-title">
                  <span className="dname">{dia.nombre}</span>
                  <span className="ddate">{dia.fechaCorta}</span>
                </div>
                {dia.esHoy && <span className="lock-note">Hoy</span>}
              </div>
              {dia.comidas.map((comida) => (
                <ComidaDelDia key={comida.comida} fecha={dia.fecha} etiquetaDia={etiqueta} datos={comida} />
              ))}
            </section>
          )
        })}
      </div>
    </>
  )
}
