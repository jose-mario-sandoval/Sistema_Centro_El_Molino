import 'server-only'
import { diaSemana, horaHHMM, sumarDias, type FechaISO } from '@/lib/fechas'
import { listarPerfiles } from '@/lib/perfiles/consultas'
import { ROLES_CON_COMIDAS } from '@/lib/perfiles/roles'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { diasDeSemana } from './semana'
import { TIEMPOS_COMIDA, type HorasLimite, type TiempoComida } from './tipos'
import {
  agregarSemana,
  armarDiaAdministracion,
  armarSemanaPersona,
  planDesdeFilas,
  resumenPlanSemanal,
  type DiaAdministracion,
  type DiaAgregado,
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

  const [horas, plan, selecciones, cerradas, ausencias] = await Promise.all([
    obtenerHorasLimite(),
    obtenerPlanPropio(usuarioId),
    supabase
      .from('selecciones_comida')
      .select('fecha, comida, estado, nota, origen')
      .eq('usuario_id', usuarioId)
      .gte('fecha', lunes)
      .lte('fecha', domingo),
    supabase.from('comidas_cerradas').select('fecha, comida').gte('fecha', lunes).lte('fecha', domingo),
    // Solo las propias: la política de la tabla no deja ver las de nadie más.
    supabase.from('ausencias').select('desde, hasta').eq('usuario_id', usuarioId).lte('desde', domingo).gte('hasta', lunes),
  ])
  if (selecciones.error) throw selecciones.error
  if (cerradas.error) throw cerradas.error
  if (ausencias.error) throw ausencias.error

  return armarSemanaPersona({
    lunes,
    ahora: new Date(),
    horas,
    plan,
    selecciones: selecciones.data,
    cerradas: cerradas.data,
    ausencias: ausencias.data,
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
    .select('usuario_id, dia_semana, comida, estado, nota', { count: 'exact' })
    .in('usuario_id', ids)
  if (filas.error) throw filas.error
  // PostgREST corta en max_rows (config.toml): si faltan filas, fallar en vez de mostrar planes incompletos.
  if (filas.count !== null && filas.count > filas.data.length) {
    throw new Error(`Planes semanales truncados: llegaron ${filas.data.length} de ${filas.count} filas.`)
  }

  return personas.map((persona) => ({
    id: persona.id,
    nombre: persona.nombre,
    plan: planDesdeFilas(filas.data.filter((fila) => fila.usuario_id === persona.id)),
  }))
}

/** Un día de la semana para Administración: valores de cada persona activa y resumen por comida. */
export async function obtenerDiaParaAdministracion(fecha: FechaISO): Promise<DiaAdministracion> {
  const supabase = await crearClienteServidor()
  const [personas, planes, selecciones, cerradas, ausentes] = await Promise.all([
    listarPerfiles({ soloActivos: true, roles: ROLES_CON_COMIDAS }),
    supabase
      .from('plan_semanal')
      .select('usuario_id, dia_semana, comida, estado, nota')
      .eq('dia_semana', diaSemana(fecha)),
    supabase.from('selecciones_comida').select('usuario_id, fecha, comida, estado, nota, origen').eq('fecha', fecha),
    supabase.from('comidas_cerradas').select('fecha, comida').eq('fecha', fecha),
    // Administración no lee la tabla de ausencias: solo sabe quién NO come ese día, sin fechas ni motivo.
    supabase.rpc('ausentes_en', { p_fecha: fecha }),
  ])
  if (planes.error) throw planes.error
  if (selecciones.error) throw selecciones.error
  if (cerradas.error) throw cerradas.error
  if (ausentes.error) throw ausentes.error

  return armarDiaAdministracion({
    fecha,
    personas,
    planes: planes.data,
    selecciones: selecciones.data,
    cerradas: cerradas.data,
    ausentes: ausentes.data,
  })
}

/** Semana completa para Administración: solo cantidades por día y tiempo de comida, nunca por persona. */
export async function obtenerSemanaParaAdministracion(lunes: FechaISO): Promise<DiaAgregado[]> {
  const domingo = sumarDias(lunes, 6)
  const dias = diasDeSemana(lunes)
  const supabase = await crearClienteServidor()
  const personas = await listarPerfiles({ soloActivos: true, roles: ROLES_CON_COMIDAS })
  const ids = personas.map((persona) => persona.id)

  const [planes, selecciones, cerradas, ausentesPorDia] = await Promise.all([
    supabase.from('plan_semanal').select('usuario_id, dia_semana, comida, estado, nota', { count: 'exact' }).in('usuario_id', ids),
    supabase
      .from('selecciones_comida')
      .select('usuario_id, fecha, comida, estado, nota, origen')
      .in('usuario_id', ids)
      .gte('fecha', lunes)
      .lte('fecha', domingo),
    supabase.from('comidas_cerradas').select('fecha, comida').gte('fecha', lunes).lte('fecha', domingo),
    Promise.all(dias.map((fecha) => supabase.rpc('ausentes_en', { p_fecha: fecha }))),
  ])
  if (planes.error) throw planes.error
  if (selecciones.error) throw selecciones.error
  if (cerradas.error) throw cerradas.error
  for (const resultado of ausentesPorDia) if (resultado.error) throw resultado.error
  // Mismo resguardo que obtenerPlanesDeTodos: si PostgREST corta en max_rows, fallar en vez de agregar de menos.
  if (planes.count !== null && planes.count > planes.data.length) {
    throw new Error(`Planes semanales truncados: llegaron ${planes.data.length} de ${planes.count} filas.`)
  }

  const diasAdministracion = dias.map((fecha, indice) =>
    armarDiaAdministracion({
      fecha,
      personas,
      planes: planes.data,
      selecciones: selecciones.data,
      cerradas: cerradas.data,
      // El error ya se revisó arriba; el `?? undefined` es solo para que TS descarte el `null` del tipo.
      ausentes: ausentesPorDia[indice].data ?? undefined,
    }),
  )
  return agregarSemana(diasAdministracion)
}

/** Cenas/comidas extra confirmadas por el enlace público, por fecha y tiempo de comida. */
export async function obtenerExtrasDeLaSemana(lunes: FechaISO): Promise<Record<string, Partial<Record<TiempoComida, number>>>> {
  const domingo = sumarDias(lunes, 6)
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('extras_de_la_semana', { p_desde: lunes, p_hasta: domingo })
  if (error) throw error

  const extras: Record<string, Partial<Record<TiempoComida, number>>> = {}
  for (const fila of data) {
    const porDia = (extras[fila.fecha] ??= {})
    porDia[fila.tiempo_comida] = fila.total
  }
  return extras
}

/** Plan habitual agregado, para Administración (nunca por persona). */
export async function obtenerResumenPlanSemanal(): Promise<Record<number, Record<TiempoComida, import('./resumen').ResumenComida>>> {
  const personas = await obtenerPlanesDeTodos()
  return resumenPlanSemanal(personas)
}
