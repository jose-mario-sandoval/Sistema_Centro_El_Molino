'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { fechaISOEn } from '@/lib/fechas'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'
import { esquemaExtra, esquemaQuitarExtra } from '@/lib/validacion/comidas'

/*
 * Extras manuales de "La casa": comidas extra que el Director avisa a la cocina a mano (visitas,
 * huéspedes). La cocina ve la cifra y la nota, nunca quién lo agregó. RLS vuelve a exigir el rol
 * y la fecha. Revalida todo /comidas: la Semana de Administración suma estos extras.
 */

/**
 * Agrega un extra (día + comida + cantidad + nota opcional para la cocina), desde hoy. También para
 * una comida que ya cerró (un invitado de último momento): la pantalla advierte antes de guardar.
 */
export async function agregarExtra(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const datos = esquemaExtra.safeParse(entrada)
  if (!datos.success) {
    const campos = camposConError(datos.error)
    return fallo(Object.values(campos)[0] ?? 'Revisá los datos.', campos)
  }

  const { fecha, comida, cantidad, nota } = datos.data
  // Un extra de un día que ya pasó no le sirve a la cocina; la base también lo rechaza.
  if (fecha < fechaISOEn(new Date())) return fallo('Revisá los datos.', { fecha: 'Ese día ya pasó.' })

  const supabase = await crearClienteServidor()
  const { error } = await supabase
    .from('extras_manuales')
    .insert({ fecha, tiempo_comida: comida, cantidad, nota, creado_por: permiso.perfil.id })
  if (error) {
    console.error('La casa: no se pudo agregar el extra', error)
    return fallo('No se pudo agregar el extra. Intentá de nuevo.')
  }

  revalidatePath('/comidas', 'layout')
  return exito(null)
}

/**
 * Quita un extra mientras esa comida no cerró (hora límite o job de cierre): después, la cocina ya
 * pudo contarlo o prepararlo. Lo exige RLS (comida_sin_cerrar); la pantalla no ofrece "Quitar".
 */
export async function quitarExtra(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const datos = esquemaQuitarExtra.safeParse(entrada)
  if (!datos.success) return fallo('Extra inválido.')

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('extras_manuales').delete().eq('id', datos.data.id).select('id')
  if (error) {
    console.error('La casa: no se pudo quitar el extra', error)
    return fallo('No se pudo quitar el extra. Intentá de nuevo.')
  }
  // RLS no da error si no hay filas afectadas: 0 filas = ya no existe o esa comida ya cerró.
  if (data.length === 0) {
    revalidatePath('/comidas', 'layout')
    return fallo('Ese extra ya no existe o esa comida ya cerró.')
  }

  revalidatePath('/comidas', 'layout')
  return exito(null)
}
