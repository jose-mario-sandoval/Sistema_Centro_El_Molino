'use server'

import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { crearClientePublico } from '@/lib/supabase/publico'
import { esquemaConfirmarCena } from '@/lib/validacion/calendario'

export async function confirmarCena(_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> {
  const entrada = esquemaConfirmarCena.safeParse({
    token: formData.get('token'),
    nombre: formData.get('nombre'),
    cantidad_personas: formData.get('cantidad_personas'),
  })
  if (!entrada.success) return fallo('Revisá los datos.', undefined)

  const supabase = crearClientePublico()
  const { error } = await supabase.rpc('confirmar_cena_extra', {
    p_token: entrada.data.token,
    p_nombre: entrada.data.nombre,
    p_cantidad: entrada.data.cantidad_personas,
  })
  if (error) return fallo(error.code === 'MOL05' ? error.message : 'No se pudo confirmar. Intentá de nuevo.')

  return exito(null)
}
