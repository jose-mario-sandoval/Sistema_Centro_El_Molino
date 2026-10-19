'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { apartadosPensiones } from '@/lib/pensiones/permisos'
import type { Rol } from '@/lib/perfiles/roles'

export function PestanasPensiones({ rol }: { rol: Rol }) {
  const ruta = usePathname()
  return <nav className="tabs" aria-label="Apartados de Pensiones">
    {apartadosPensiones(rol).map((p) => <Link key={p.ruta} href={p.ruta} className={`tab-btn${ruta === p.ruta ? ' active' : ''}`} aria-current={ruta === p.ruta ? 'page' : undefined}>{p.etiqueta}</Link>)}
  </nav>
}
