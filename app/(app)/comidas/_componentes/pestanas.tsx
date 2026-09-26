'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { pestanasComidas } from '@/lib/comidas/casa'

/** Plan de comida y Semana; el Director tiene además "La casa" (las comidas de todos). */
export function PestanasComidas({ esDirector }: { esDirector: boolean }) {
  const ruta = usePathname()
  return (
    <nav className="tabs" aria-label="Comidas">
      {pestanasComidas(esDirector).map((pestana) => {
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
