import type { Rol } from '@/lib/perfiles/roles'

export const ROLES_PENSIONES: Rol[] = ['director', 'residente', 'administradora']
export const ROLES_PRESUPUESTO: Rol[] = ['director', 'administradora']
export const ROLES_PAGO: Rol[] = ['director', 'residente']

export function puedeVerPensiones(rol: Rol): boolean {
  return ROLES_PENSIONES.includes(rol)
}

export function apartadosPensiones(rol: Rol) {
  if (!puedeVerPensiones(rol)) return []
  return [
    ...(rol === 'director' ? [{ ruta: '/pensiones/editar', etiqueta: 'Editar' }] : []),
    ...(ROLES_PAGO.includes(rol) ? [{ ruta: '/pensiones/marcar', etiqueta: 'Marcar pensiones' }] : []),
    ...(ROLES_PRESUPUESTO.includes(rol) ? [
      { ruta: '/pensiones/presupuesto', etiqueta: 'Presupuesto' },
      { ruta: '/pensiones/reporte', etiqueta: 'Reporte' },
    ] : []),
  ]
}
