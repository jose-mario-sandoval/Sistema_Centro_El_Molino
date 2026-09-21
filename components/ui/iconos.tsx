import type { ReactNode } from 'react'
import type { EstadoComida } from '@/lib/comidas/tipos'

/**
 * Iconos de trazo (DESIGN.md §2.3). Cada estado de comida tiene el suyo: es el canal que no
 * depende del color, así que nunca se usa uno para dos cosas. Siempre `currentColor`.
 */
const TRAZOS = {
  si: <path d="M4 13l5 5L20 6" />,
  no: <path d="M6 6l12 12M18 6L6 18" />,
  temprano: <path d="M12 2v3M4.5 9.5L2.8 7.8M19.5 9.5l1.7-1.7M2 18h20M7 18a5 5 0 0 1 10 0" />,
  tarde: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  bolsa: (
    <>
      <path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9L5 8z" />
      <path d="M8.5 8V6a3.5 3.5 0 0 1 7 0v2" />
    </>
  ),
  enfermo: (
    <>
      <path d="M12 3a2 2 0 0 1 2 2v9.2a4 4 0 1 1-4 0V5a2 2 0 0 1 2-2z" />
      <path d="M12 10v5" />
    </>
  ),
  // "Sin definir": la campana del aviso push que dispara cuando una comida está por cerrar.
  sinDefinir: (
    <>
      <path d="M12 3a6 6 0 0 1 6 6c0 5 2 6 2 6H4s2-1 2-6a6 6 0 0 1 6-6z" />
      <path d="M10 21h4" />
    </>
  ),
  comidas: (
    <>
      <path d="M4 11h16a8 8 0 0 1-16 0z" />
      <path d="M2 21h20M12 4v3" />
    </>
  ),
  mensajes: <path d="M21 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z" />,
  calendario: (
    <>
      <path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 10h18M8 2v4M16 2v4" />
    </>
  ),
  ajustes: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
      <circle cx="9" cy="7" r="2.2" />
      <circle cx="15" cy="12" r="2.2" />
      <circle cx="8" cy="17" r="2.2" />
    </>
  ),
  // Lo que un evento le pide a la cocina: 'comida' usa el plato (`comidas`).
  merienda: (
    <>
      <path d="M5 8h11v6a5 5 0 0 1-5 5H10a5 5 0 0 1-5-5V8z" />
      <path d="M16 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2" />
    </>
  ),
  materiales: (
    <>
      <path d="M6 3v6a2 2 0 0 0 2 2 2 2 0 0 0 2-2V3M8 11v10" />
      <path d="M17 3c-2 0-3 2-3 5s1 4 3 4v9" />
    </>
  ),
  izquierda: <path d="M15 5l-7 7 7 7" />,
  derecha: <path d="M9 5l7 7-7 7" />,
  abajo: <path d="M5 9l7 7 7-7" />,
  candado: (
    <>
      <path d="M5 11h14v10H5z" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
} satisfies Record<EstadoComida, ReactNode> & Record<string, ReactNode> // agregar un estado sin icono no compila

export type NombreIcono = keyof typeof TRAZOS

export function Icono({ nombre, className }: { nombre: NombreIcono; className?: string }) {
  return (
    <svg
      className={className ? `icono ${className}` : 'icono'}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {TRAZOS[nombre]}
    </svg>
  )
}
