import { redirect } from 'next/navigation'
import { exigirRol } from '@/lib/auth/sesion'
import { ROLES_PENSIONES } from '@/lib/pensiones/permisos'

export default async function PaginaPensiones() {
  const perfil = await exigirRol(...ROLES_PENSIONES)
  redirect(perfil.rol === 'administradora' ? '/pensiones/presupuesto' : '/pensiones/marcar')
}
