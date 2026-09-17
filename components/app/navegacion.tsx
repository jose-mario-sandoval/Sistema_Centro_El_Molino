'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const SECCIONES = [
  {
    ruta: '/comidas/semana',
    prefijo: '/comidas',
    etiqueta: 'Comidas',
    icono: 'M6 3v6a2 2 0 0 0 2 2v10M6 3v18M10 3v8M18 3c-2 0-3 2-3 5s1 4 3 4v9',
  },
  {
    ruta: '/mensajes',
    prefijo: '/mensajes',
    etiqueta: 'Mensajes',
    icono:
      'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  },
  {
    ruta: '/calendario',
    prefijo: '/calendario',
    etiqueta: 'Calendario',
    icono: 'M3 9.5h18M8 2.5v4M16 2.5v4M4.5 4.5h15a1.5 1.5 0 0 1 1.5 1.5v13a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19V6a1.5 1.5 0 0 1 1.5-1.5z',
  },
  {
    ruta: '/configuraciones',
    prefijo: '/configuraciones',
    etiqueta: 'Configuraciones',
    icono:
      'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
  },
] as const

function Icono({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function NavegacionLateral() {
  const ruta = usePathname()
  return (
    <nav className="nav" aria-label="Secciones">
      {SECCIONES.map((s) => {
        const activa = ruta.startsWith(s.prefijo)
        return (
          <Link key={s.ruta} href={s.ruta} className={`nav-item${activa ? ' active' : ''}`} aria-current={activa ? 'page' : undefined}>
            <Icono d={s.icono} />
            <span>{s.etiqueta}</span>
          </Link>
        )
      })}
    </nav>
  )
}

export function NavegacionMovil() {
  const ruta = usePathname()
  const router = useRouter()
  const actual = SECCIONES.find((s) => ruta.startsWith(s.prefijo))?.ruta ?? SECCIONES[0].ruta
  return (
    <select id="mobile-nav-select" aria-label="Sección" value={actual} onChange={(e) => router.push(e.target.value)}>
      {SECCIONES.map((s) => (
        <option key={s.ruta} value={s.ruta}>
          {s.etiqueta}
        </option>
      ))}
    </select>
  )
}
