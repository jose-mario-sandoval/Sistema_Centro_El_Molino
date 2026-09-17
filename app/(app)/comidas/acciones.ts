'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { obtenerHorasLimite } from '@/lib/comidas/consultas'
import { mensajeNota } from '@/lib/comidas/notas'
import { mensajeComidaCerrada } from '@/lib/comidas/semana'
import type { EstadoComida, TiempoComida } from '@/lib/comidas/tipos'
import type { FechaISO } from '@/lib/fechas'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'
import { esquemaPlan, esquemaSeleccion, esquemaVolverAPlan } from '@/lib/validacion/comidas'

const ERROR_GENERAL = 'No se pudo guardar. Intentá de nuevo.'

type ErrorBase = { code?: string; message?: string }

function falloDeValidacion(error: Parameters<typeof camposConError>[0]) {
  const campos = camposConError(error)
  return fallo(Object.values(campos)[0] ?? 'Datos inválidos.', campos)
}

async function mensajeDeError(
  error: ErrorBase,
  datos: { fecha?: FechaISO; comida: TiempoComida; estado?: EstadoComida | null },
): Promise<string> {
  switch (error.code) {
    case 'MOL01':
      return datos.fecha
        ? mensajeComidaCerrada({ fecha: datos.fecha, comida: datos.comida, ahora: new Date(), horas: await obtenerHorasLimite() })
        : ERROR_GENERAL
    case 'MOL04':
    case '23514':
      return datos.estado ? mensajeNota(datos.estado) : ERROR_GENERAL
    case '42501':
      return 'No tenés permiso para hacer esto.'
    default:
      console.error('Comidas: error al guardar', error)
      return ERROR_GENERAL
  }
}

/** Una celda del Plan semanal propio. `estado: null` borra la fila (spec §6.5). */
export async function guardarPlan(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director', 'residente')
  if (!permiso.ok) return permiso

  const datos = esquemaPlan.safeParse(entrada)
  if (!datos.success) return falloDeValidacion(datos.error)

  const { diaSemana, comida, estado, nota } = datos.data
  const clave = { usuario_id: permiso.perfil.id, dia_semana: diaSemana, comida }
  const supabase = await crearClienteServidor()

  const { error } =
    estado === null
      ? await supabase.from('plan_semanal').delete().match(clave)
      : await supabase
          .from('plan_semanal')
          .upsert({ ...clave, estado, nota }, { onConflict: 'usuario_id,dia_semana,comida' })
  if (error) return fallo(await mensajeDeError(error, { comida, estado }))

  revalidatePath('/comidas', 'layout')
  return exito(null)
}

/** Selección de una comida de la semana actual o la siguiente (spec §6.4). */
export async function guardarSeleccion(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director', 'residente')
  if (!permiso.ok) return permiso

  const datos = esquemaSeleccion.safeParse(entrada)
  if (!datos.success) return falloDeValidacion(datos.error)

  const { fecha, comida, estado, nota } = datos.data
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('guardar_seleccion', {
    p_fecha: fecha,
    p_comida: comida,
    p_estado: estado,
    // La función acepta null; los tipos generados declaran text como string.
    p_nota: nota as string,
  })
  if (error) {
    // MOL01: la ventana se cerró justo antes de guardar. Revalidamos igual para
    // que el refresco del cliente (spec §6.4) traiga el estado real, no el caché.
    if (error.code === 'MOL01') revalidatePath('/comidas', 'layout')
    return fallo(await mensajeDeError(error, { fecha, comida, estado }))
  }

  revalidatePath('/comidas', 'layout')
  return exito(null)
}

/** Borra el cambio de la persona y vuelve a su plan (spec §6.4). */
export async function volverAPlan(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director', 'residente')
  if (!permiso.ok) return permiso

  const datos = esquemaVolverAPlan.safeParse(entrada)
  if (!datos.success) return falloDeValidacion(datos.error)

  const { fecha, comida } = datos.data
  const supabase = await crearClienteServidor()
  const { error } = await supabase.rpc('volver_a_plan', { p_fecha: fecha, p_comida: comida })
  if (error) {
    // MOL01: la ventana se cerró justo antes de guardar. Revalidamos igual para
    // que el refresco del cliente (spec §6.4) traiga el estado real, no el caché.
    if (error.code === 'MOL01') revalidatePath('/comidas', 'layout')
    return fallo(await mensajeDeError(error, { fecha, comida }))
  }

  revalidatePath('/comidas', 'layout')
  return exito(null)
}
