'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'
import { esquemaEditarEvento, esquemaEliminarEvento, esquemaEvento } from '@/lib/validacion/calendario'

function leerFormulario(formData: FormData) {
  return {
    id: formData.get('id'),
    titulo: formData.get('titulo'),
    fecha: formData.get('fecha'),
    hora: formData.get('hora') ?? '',
  }
}

/** Solo el Director (spec §5.1). RLS lo vuelve a exigir en la base. */
export async function crearEvento(
  _previo: Resultado<{ id: string }> | null,
  formData: FormData,
): Promise<Resultado<{ id: string }>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const entrada = esquemaEvento.safeParse(leerFormulario(formData))
  if (!entrada.success) return fallo('Revisá los datos del evento.', camposConError(entrada.error))

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('eventos')
    .insert({ ...entrada.data, creado_por: permiso.perfil.id })
    .select('id')
    .single()
  if (error) return fallo('No se pudo guardar el evento. Intentá de nuevo.')

  revalidatePath('/calendario')
  return exito({ id: data.id })
}

export async function editarEvento(_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const entrada = esquemaEditarEvento.safeParse(leerFormulario(formData))
  if (!entrada.success) return fallo('Revisá los datos del evento.', camposConError(entrada.error))

  const { id, ...cambios } = entrada.data
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('eventos').update(cambios).eq('id', id).select('id')
  if (error) return fallo('No se pudo guardar el evento. Intentá de nuevo.')
  // RLS no da error si no hay filas afectadas (spec §6.4): 0 filas = el evento ya no existe.
  if (data.length === 0) return fallo('El evento ya no existe.')

  revalidatePath('/calendario')
  return exito(null)
}

export async function eliminarEvento(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const datos = esquemaEliminarEvento.safeParse(entrada)
  if (!datos.success) return fallo('Evento inválido.')

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('eventos').delete().eq('id', datos.data.id).select('id')
  if (error) return fallo('No se pudo eliminar el evento. Intentá de nuevo.')
  if (data.length === 0) return fallo('El evento ya no existe.')

  revalidatePath('/calendario')
  return exito(null)
}
