import Link from 'next/link'
import { Icono } from '@/components/ui/iconos'
import { navegacionSemana, rangoSemana } from '@/lib/comidas/semana'
import type { FechaISO } from '@/lib/fechas'

const DESCRIPCION = { pasada: 'Semana pasada', actual: 'Esta semana', siguiente: 'Semana que viene' } as const

/** `ruta`: la página que se pagina (Semana, La casa o la semana de una persona en La casa). */
export function NavegacionSemana({
  lunes,
  hoy,
  ruta = '/comidas/semana',
}: {
  lunes: FechaISO
  hoy: FechaISO
  ruta?: string
}) {
  const { anterior, siguiente, tipo } = navegacionSemana(lunes, hoy)

  return (
    <div className="week-nav">
      <Link href={`${ruta}?semana=${anterior}`} className="icon-btn" aria-label="Semana anterior">
        <Icono nombre="izquierda" />
      </Link>
      <div className="range">
        <span className="range-tipo">{DESCRIPCION[tipo]}</span>
        <span className="range-fechas">{rangoSemana(lunes)}</span>
      </div>
      {siguiente ? (
        <Link href={`${ruta}?semana=${siguiente}`} className="icon-btn" aria-label="Semana siguiente">
          <Icono nombre="derecha" />
        </Link>
      ) : (
        // aria-label no se anuncia de forma confiable en un <span> sin rol: texto oculto a la vista.
        <span className="icon-btn" aria-disabled="true">
          <Icono nombre="derecha" />
          <span className="sr-only">Semana siguiente (no disponible)</span>
        </span>
      )}
      {tipo !== 'actual' && (
        <Link href={ruta} className="btn ghost block">
          Ir a la semana actual
        </Link>
      )}
    </div>
  )
}
