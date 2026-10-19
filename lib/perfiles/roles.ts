import type { Enum } from '@/lib/supabase/tipos'

export type Rol = Enum<'rol'>

export const ROLES: Rol[] = ['director', 'residente', 'administracion', 'administradora']

export const ETIQUETA_ROL: Record<Rol, string> = {
  director: 'Director',
  residente: 'Residente',
  administracion: 'Administración',
  administradora: 'Administradora',
}

/** Ambos roles comparten las capacidades de cocina e identidad privada; siguen siendo distintos. */
export const ROLES_ADMINISTRACION = ['administracion', 'administradora'] as const satisfies readonly Rol[]

export function esAdministracion(rol: Rol | null | undefined): rol is (typeof ROLES_ADMINISTRACION)[number] {
  return rol === 'administracion' || rol === 'administradora'
}

/** Roles que tienen Plan semanal y Semana propios. */
export const ROLES_CON_COMIDAS: Rol[] = ['director', 'residente']
