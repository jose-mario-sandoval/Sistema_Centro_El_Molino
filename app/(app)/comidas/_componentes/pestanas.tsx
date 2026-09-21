'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const PESTANAS = [
  { ruta: '/comidas/plan', etiqueta: 'Plan de comida' },
  { ruta: '/comidas/semana', etiqueta: 'Semana' },
] as const

export function PestanasComidas() {
  const ruta = usePathname()
  return (
    <nav className="tabs" aria-label="Comidas">
      {PESTANAS.map((pestana) => {
        const activa = ruta.startsWith(pestana.ruta)
        return (
          <Link
            key={pestana.ruta}
            href={pestana.ruta}
            className={`tab-btn${activa ? ' active' : ''}`}
            aria-current={activa ? 'page' : undefined}
          >
            {pestana.etiqueta}
          </Link>
        )
      })}
    </nav>
  )
}
