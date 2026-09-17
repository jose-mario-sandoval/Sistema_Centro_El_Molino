import type { Enum } from '@/lib/supabase/tipos'

export type Rol = Enum<'rol'>

export const ROLES: Rol[] = ['director', 'residente', 'administracion']

export const ETIQUETA_ROL: Record<Rol, string> = {
  director: 'Director',
  residente: 'Residente',
  administracion: 'Administración',
}

/** Roles que tienen Plan semanal y Semana propios. */
export const ROLES_CON_COMIDAS: Rol[] = ['director', 'residente']
