'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Icono, type NombreIcono } from '@/components/ui/iconos'

// "Ajustes" y no "Configuraciones": cabe en la barra inferior y es el nombre que la gente ya
// conoce del teléfono.
const SECCIONES: readonly { ruta: string; prefijo: string; etiqueta: string; icono: NombreIcono }[] = [
  { ruta: '/comidas/semana', prefijo: '/comidas', etiqueta: 'Comidas', icono: 'comidas' },
  { ruta: '/mensajes', prefijo: '/mensajes', etiqueta: 'Mensajes', icono: 'mensajes' },
  { ruta: '/calendario', prefijo: '/calendario', etiqueta: 'Calendario', icono: 'calendario' },
  { ruta: '/configuraciones', prefijo: '/configuraciones', etiqueta: 'Ajustes', icono: 'ajustes' },
]

function Enlaces() {
  const ruta = usePathname()
  return SECCIONES.map((s) => {
    const activa = ruta.startsWith(s.prefijo)
    return (
      <Link
        key={s.ruta}
        href={s.ruta}
        className={`nav-item${activa ? ' active' : ''}`}
        aria-current={activa ? 'page' : undefined}
      >
        <Icono nombre={s.icono} />
        <span>{s.etiqueta}</span>
      </Link>
    )
  })
}

/** Escritorio: en el lateral. */
export function NavegacionLateral() {
  return (
    <nav className="nav" aria-label="Secciones">
      <Enlaces />
    </nav>
  )
}

/** Teléfono: barra fija abajo, cuatro destinos siempre visibles con icono y nombre. */
export function NavegacionInferior() {
  return (
    <nav className="barra-inferior" aria-label="Secciones">
      <Enlaces />
    </nav>
  )
}
