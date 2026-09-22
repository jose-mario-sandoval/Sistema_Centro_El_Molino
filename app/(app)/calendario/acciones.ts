'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { generarFechasSerie, type ParametrosSerie } from '@/lib/calendario/recurrencia'
import { fechaISOEn, instanteEnZona } from '@/lib/fechas'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'
import {
  esquemaCrearEnlace,
  esquemaEditarEvento,
  esquemaEliminarEvento,
  esquemaEliminarSerie,
  esquemaEvento,
  esquemaListarEnlaces,
  esquemaRevocarEnlace,
  esquemaSerieEventos,
} from '@/lib/validacion/calendario'

function leerFormulario(formData: FormData) {
  return {
    id: formData.get('id'),
    titulo: formData.get('titulo'),
    fecha: formData.get('fecha'),
    hora: formData.get('hora') ?? '',
    tipo: formData.get('tipo'),
    // Casillas: cada una marcada llega como un valor; ninguna marcada = no pide nada.
    requiere_cocina: formData.getAll('requiere_cocina'),
    requiere_otro_texto: formData.get('requiere_otro_texto') ?? '',
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
  if (data.length === 0) {
    revalidatePath('/calendario')
    return fallo('El evento ya no existe.')
  }

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
  if (data.length === 0) {
    revalidatePath('/calendario')
    return fallo('El evento ya no existe.')
  }

  revalidatePath('/calendario')
  return exito(null)
}

export async function crearEnlaceConfirmacion(
  _previo: Resultado<{ id: string; token: string }> | null,
  formData: FormData,
): Promise<Resultado<{ id: string; token: string }>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const entrada = esquemaCrearEnlace.safeParse({
    evento_id: formData.get('evento_id'),
    tiempo_comida: formData.get('tiempo_comida'),
    fecha_vencimiento: formData.get('fecha_vencimiento'),
    hora_vencimiento: formData.get('hora_vencimiento'),
  })
  if (!entrada.success) return fallo('Revisá los datos del enlace.', camposConError(entrada.error))

  const vence_en = instanteEnZona(entrada.data.fecha_vencimiento, entrada.data.hora_vencimiento).toISOString()
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('enlaces_confirmacion')
    .insert({
      evento_id: entrada.data.evento_id,
      tiempo_comida: entrada.data.tiempo_comida,
      vence_en,
      creado_por: permiso.perfil.id,
    })
    .select('id, token')
    .single()
  if (error) return fallo('No se pudo generar el enlace. La hora de vencimiento debe ser futura.')

  revalidatePath('/calendario')
  return exito(data)
}

export async function listarEnlacesDelEvento(entrada: unknown): Promise<
  Resultado<{ id: string; token: string; tiempoComida: string; venceEn: string; confirmaciones: { nombre: string; cantidadPersonas: number }[] }[]>
> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const datos = esquemaListarEnlaces.safeParse(entrada)
  if (!datos.success) return fallo('Evento inválido.')

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('enlaces_confirmacion')
    .select('id, token, tiempo_comida, vence_en, confirmaciones_extra(nombre, cantidad_personas)')
    .eq('evento_id', datos.data.evento_id)
    .order('creado_en')
  if (error) return fallo('No se pudieron cargar los enlaces.')

  return exito(
    data.map((e) => ({
      id: e.id,
      token: e.token,
      tiempoComida: e.tiempo_comida,
      venceEn: e.vence_en,
      confirmaciones: e.confirmaciones_extra.map((c) => ({ nombre: c.nombre, cantidadPersonas: c.cantidad_personas })),
    })),
  )
}

export async function revocarEnlaceConfirmacion(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const datos = esquemaRevocarEnlace.safeParse(entrada)
  if (!datos.success) return fallo('Enlace inválido.')

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('enlaces_confirmacion')
    .update({ vence_en: new Date().toISOString() })
    .eq('id', datos.data.id)
    .select('id')
  if (error) return fallo('No se pudo revocar el enlace. Intentá de nuevo.')
  // RLS no da error si no hay filas afectadas (mismo caso que editarEvento): 0 filas = ya no existe.
  if (data.length === 0) return fallo('El enlace ya no existe.')

  revalidatePath('/calendario')
  return exito(null)
}

export async function crearSerieEventos(
  _previo: Resultado<{ id: string; cantidad: number }> | null,
  formData: FormData,
): Promise<Resultado<{ id: string; cantidad: number }>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const entrada = esquemaSerieEventos.safeParse({
    titulo: formData.get('titulo'),
    hora: formData.get('hora') ?? '',
    tipo: formData.get('tipo'),
    requiere_cocina: formData.getAll('requiere_cocina'),
    requiere_otro_texto: formData.get('requiere_otro_texto') ?? '',
    patron: formData.get('patron'),
    dia_semana: formData.get('dia_semana') || undefined,
    ordinal_semana: formData.get('ordinal_semana') || undefined,
    dia_mes: formData.get('dia_mes') || undefined,
    fecha_inicio: formData.get('fecha_inicio'),
    fecha_fin: formData.get('fecha_fin'),
  })
  if (!entrada.success) return fallo('Revisá los datos de la serie.', camposConError(entrada.error))

  const datos = entrada.data
  const parametros: ParametrosSerie =
    datos.patron === 'semanal'
      ? { patron: 'semanal', diaSemana: datos.dia_semana! }
      : datos.patron === 'mensual_dia_fijo'
        ? { patron: 'mensual_dia_fijo', diaMes: datos.dia_mes! }
        : { patron: 'mensual_dia_semana', diaSemana: datos.dia_semana!, ordinalSemana: datos.ordinal_semana as 1 | 2 | 3 | 4 | -1 }
  const fechas = generarFechasSerie(parametros, datos.fecha_inicio, datos.fecha_fin)
  if (fechas.length === 0) {
    return fallo('Ese patrón no genera ninguna fecha en el rango elegido.', { fecha_fin: 'Ajustá el rango o el patrón.' })
  }

  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('crear_serie_eventos', {
    p_patron: datos.patron,
    p_dia_semana: datos.dia_semana ?? null,
    p_ordinal_semana: datos.ordinal_semana ?? null,
    p_dia_mes: datos.dia_mes ?? null,
    p_fecha_inicio: datos.fecha_inicio,
    p_fecha_fin: datos.fecha_fin,
    p_hora: datos.hora,
    p_titulo: datos.titulo,
    p_tipo: datos.tipo,
    p_requiere_cocina: datos.requiere_cocina,
    p_requiere_otro_texto: datos.requiere_otro_texto,
    p_fechas: fechas,
  })
  if (error) return fallo('No se pudo crear la serie. Intentá de nuevo.')

  revalidatePath('/calendario')
  return exito({ id: data, cantidad: fechas.length })
}

export async function eliminarSerieDesdeHoy(entrada: unknown): Promise<Resultado<{ cantidad: number }>> {
  const permiso = await perfilParaAccion('director')
  if (!permiso.ok) return permiso

  const datos = esquemaEliminarSerie.safeParse(entrada)
  if (!datos.success) return fallo('Serie inválida.')

  const hoy = fechaISOEn(new Date())
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('eventos').delete().eq('serie_id', datos.data.serie_id).gte('fecha', hoy).select('id')
  if (error) return fallo('No se pudo cancelar la serie. Intentá de nuevo.')

  revalidatePath('/calendario')
  return exito({ cantidad: data.length })
}
