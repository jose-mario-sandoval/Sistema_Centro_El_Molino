import 'server-only'
import { diaSemana, horaHHMM, sumarDias, type FechaISO } from '@/lib/fechas'
import { listarPerfiles } from '@/lib/perfiles/consultas'
import { ROLES_CON_COMIDAS } from '@/lib/perfiles/roles'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { TIEMPOS_COMIDA, type HorasLimite } from './tipos'
import {
  armarDiaAdministracion,
  armarSemanaPersona,
  planDesdeFilas,
  type DiaAdministracion,
  type DiaDeSemana,
  type PersonaConPlan,
  type PlanSemanal,
} from './vista'

/** Las 3 horas límite vigentes (tabla horas_limite de la Fase 0). */
export async function obtenerHorasLimite(): Promise<HorasLimite> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('horas_limite').select('comida, dia_relativo, hora')
  if (error) throw error

  const horas = {} as HorasLimite
  for (const comida of TIEMPOS_COMIDA) {
    const fila = data.find((f) => f.comida === comida)
    if (!fila) throw new Error(`Falta la hora límite de ${comida}.`)
    horas[comida] = { diaRelativo: fila.dia_relativo === -1 ? -1 : 0, hora: horaHHMM(fila.hora) }
  }
  return horas
}

export async function obtenerPlanPropio(usuarioId: string): Promise<PlanSemanal> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('plan_semanal')
    .select('dia_semana, comida, estado, nota')
    .eq('usuario_id', usuarioId)
  if (error) throw error
  return planDesdeFilas(data)
}

/** Semana de lunes a domingo con el valor efectivo y el estado de cierre de cada comida. */
export async function obtenerSemanaPropia(usuarioId: string, lunes: FechaISO): Promise<DiaDeSemana[]> {
  const domingo = sumarDias(lunes, 6)
  const supabase = await crearClienteServidor()

  const [horas, plan, selecciones, cerradas] = await Promise.all([
    obtenerHorasLimite(),
    obtenerPlanPropio(usuarioId),
    supabase
      .from('selecciones_comida')
      .select('fecha, comida, estado, nota, origen')
      .eq('usuario_id', usuarioId)
      .gte('fecha', lunes)
      .lte('fecha', domingo),
    supabase.from('comidas_cerradas').select('fecha, comida').gte('fecha', lunes).lte('fecha', domingo),
  ])
  if (selecciones.error) throw selecciones.error
  if (cerradas.error) throw cerradas.error

  return armarSemanaPersona({
    lunes,
    ahora: new Date(),
    horas,
    plan,
    selecciones: selecciones.data,
    cerradas: cerradas.data,
  })
}

/** Plan semanal de cada Director/Residente activo (Administración, solo lectura). */
export async function obtenerPlanesDeTodos(): Promise<PersonaConPlan[]> {
  const supabase = await crearClienteServidor()
  const personas = await listarPerfiles({ soloActivos: true, roles: ROLES_CON_COMIDAS })
  if (personas.length === 0) return []

  // Acotamos a las personas activas ya listadas: evita traer filas de usuarios
  // inactivos o sin rol de comidas cuando la tabla crece.
  const ids = personas.map((persona) => persona.id)
  const filas = await supabase
    .from('plan_semanal')
    .select('usuario_id, dia_semana, comida, estado, nota')
    .in('usuario_id', ids)
  if (filas.error) throw filas.error

  return personas.map((persona) => ({
    id: persona.id,
    nombre: persona.nombre,
    plan: planDesdeFilas(filas.data.filter((fila) => fila.usuario_id === persona.id)),
  }))
}

/** Un día de la semana para Administración: valores de cada persona activa y resumen por comida. */
export async function obtenerDiaParaAdministracion(fecha: FechaISO): Promise<DiaAdministracion> {
  const supabase = await crearClienteServidor()
  const [personas, planes, selecciones, cerradas] = await Promise.all([
    listarPerfiles({ soloActivos: true, roles: ROLES_CON_COMIDAS }),
    supabase
      .from('plan_semanal')
      .select('usuario_id, dia_semana, comida, estado, nota')
      .eq('dia_semana', diaSemana(fecha)),
    supabase.from('selecciones_comida').select('usuario_id, fecha, comida, estado, nota, origen').eq('fecha', fecha),
    supabase.from('comidas_cerradas').select('fecha, comida').eq('fecha', fecha),
  ])
  if (planes.error) throw planes.error
  if (selecciones.error) throw selecciones.error
  if (cerradas.error) throw cerradas.error

  return armarDiaAdministracion({
    fecha,
    personas,
    planes: planes.data,
    selecciones: selecciones.data,
    cerradas: cerradas.data,
  })
}
