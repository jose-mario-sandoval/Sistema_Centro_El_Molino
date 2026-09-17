import Link from 'next/link'
import { navegacionSemana, rangoSemana } from '@/lib/comidas/semana'
import type { FechaISO } from '@/lib/fechas'

const DESCRIPCION = { pasada: 'semana pasada', actual: 'semana actual', siguiente: 'semana siguiente' } as const

export function NavegacionSemana({ lunes, hoy }: { lunes: FechaISO; hoy: FechaISO }) {
  const { anterior, siguiente, tipo } = navegacionSemana(lunes, hoy)

  return (
    <div className="week-nav">
      <Link href={`/comidas/semana?semana=${anterior}`} className="icon-btn" aria-label="Semana anterior">
        ‹
      </Link>
      <div className="range">
        {rangoSemana(lunes)} · {DESCRIPCION[tipo]}
      </div>
      {siguiente ? (
        <Link href={`/comidas/semana?semana=${siguiente}`} className="icon-btn" aria-label="Semana siguiente">
          ›
        </Link>
      ) : (
        <span className="icon-btn" aria-disabled="true" aria-label="Semana siguiente (no disponible)">
          ›
        </span>
      )}
      {tipo !== 'actual' && (
        <Link href="/comidas/semana" className="btn ghost small">
          Ir a la semana actual
        </Link>
      )}
    </div>
  )
}
