'use server'

import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { fechaISOEn } from '@/lib/fechas'
import { avisarExtraCocina } from '@/lib/push/avisos-casa'
import { crearClienteAdmin } from '@/lib/supabase/admin'
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
  // Aviso a la cocina (plan 2026-09-29, aviso d): solo día, comida, cantidad y nota; nunca quién.
  const actorId = permiso.perfil.id
  after(() => avisarExtraCocina({ actorId, fecha, comida, cantidad, nota: nota ?? null, accion: 'agregado' }))
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
  // Lo borrado vuelve con sus datos: el aviso a la cocina dice qué comida y cuántos menos.
  const { data, error } = await supabase
    .from('extras_manuales')
    .delete()
    .eq('id', datos.data.id)
    .select('id, fecha, tiempo_comida, cantidad, nota')
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
  const actorId = permiso.perfil.id
  const quitado = data[0]
  after(() =>
    avisarExtraCocina({
      actorId,
      fecha: quitado.fecha,
      comida: quitado.tiempo_comida,
      cantidad: quitado.cantidad,
      nota: quitado.nota,
      accion: 'quitado',
    }),
  )
  return exito(null)
}

/**
 * Quita una confirmación del enlace público de cena extra (alguien anotó de más o por error), mientras esa
 * comida no cerró. `authenticated` no puede borrar `confirmaciones_extra`: se lee con la sesión del
 * Director (RLS), se comprueba el cierre con `comida_sin_cerrar` y se borra con la llave de servidor.
 */
export async function quitarConfirmacionExtra(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const datos = esquemaQuitarExtra.safeParse(entrada)
  if (!datos.success) return fallo('Extra inválido.')
  const { id } = datos.data

  const supabase = await crearClienteServidor()
  const { data: fila, error: errorLectura } = await supabase
    .from('confirmaciones_extra')
    .select('id, cantidad_personas, enlaces_confirmacion!inner(tiempo_comida, eventos!inner(fecha))')
    .eq('id', id)
    .maybeSingle()
  if (errorLectura) {
    console.error('La casa: no se pudo leer la confirmación', errorLectura)
    return fallo('No se pudo quitar el extra. Intentá de nuevo.')
  }
  if (!fila) {
    revalidatePath('/comidas', 'layout')
    return fallo('Ese extra ya no existe.')
  }
  const fecha = fila.enlaces_confirmacion.eventos.fecha
  const comida = fila.enlaces_confirmacion.tiempo_comida

  const { data: sinCerrar, error: errorCierre } = await supabase.rpc('comida_sin_cerrar', {
    p_fecha: fecha,
    p_comida: comida,
  })
  if (errorCierre) {
    console.error('La casa: no se pudo comprobar el cierre', errorCierre)
    return fallo('No se pudo quitar el extra. Intentá de nuevo.')
  }
  if (!sinCerrar) return fallo('Esa comida ya cerró: la cocina ya pudo contarlo.')

  const { error } = await crearClienteAdmin().from('confirmaciones_extra').delete().eq('id', id)
  if (error) {
    console.error('La casa: no se pudo quitar la confirmación', error)
    return fallo('No se pudo quitar el extra. Intentá de nuevo.')
  }

  revalidatePath('/comidas', 'layout')
  const actorId = permiso.perfil.id
  const cantidad = fila.cantidad_personas
  after(() => avisarExtraCocina({ actorId, fecha, comida, cantidad, nota: null, accion: 'quitado' }))
  return exito(null)
}
