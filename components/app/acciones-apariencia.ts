'use server'

import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { COLUMNA_DE, type ColumnasApariencia } from '@/lib/apariencia'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { esquemaApariencia } from '@/lib/validacion/apariencia'

/**
 * Apariencia de la propia cuenta (DESIGN.md §5): cliente admin después de perfilParaAccion(), como
 * las preferencias de avisos. Sin revalidatePath: la pantalla ya se pintó con el cambio, y no hay
 * nada más que refrescar.
 */
export async function guardarApariencia(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion()
  if (!permiso.ok) return permiso

  const datos = esquemaApariencia.safeParse(entrada)
  if (!datos.success) return fallo('La apariencia no es válida.')

  const cambios: Partial<Record<keyof ColumnasApariencia, string>> = {}
  for (const [clave, valor] of Object.entries(datos.data)) {
    cambios[COLUMNA_DE[clave as keyof typeof COLUMNA_DE]] = valor
  }

  const { error } = await crearClienteAdmin().from('perfiles').update(cambios).eq('id', permiso.perfil.id)
  if (error) {
    console.error('guardarApariencia', error)
    return fallo('No se pudo guardar tu apariencia en tu cuenta.')
  }
  return exito(null)
}
