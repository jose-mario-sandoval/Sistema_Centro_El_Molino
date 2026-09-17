import { diaSemana, fechaISOEn, type FechaISO } from '@/lib/fechas'
import { estaAbierta, valorEfectivo } from './reglas'
import { resumenComida, type ResumenComida } from './resumen'
import { diasDeSemana, fechaCorta, nombreDia, textoCierre } from './semana'
import {
  TIEMPOS_COMIDA,
  type EstadoComida,
  type HorasLimite,
  type OrigenSeleccion,
  type SeleccionGuardada,
  type TiempoComida,
  type ValorComida,
  type ValorEfectivo,
} from './tipos'

/** Plan de una persona: plan[díaDeSemana 1..7][comida]. Serializable (se pasa al cliente). */
export type PlanSemanal = Partial<Record<number, Partial<Record<TiempoComida, ValorComida>>>>

/** Filas tal como las devuelve Supabase. */
export type FilaPlan = { dia_semana: number; comida: TiempoComida; estado: EstadoComida; nota: string | null }
export type FilaSeleccion = {
  fecha: FechaISO
  comida: TiempoComida
  estado: EstadoComida
  nota: string | null
  origen: OrigenSeleccion
}
export type FilaCerrada = { fecha: FechaISO; comida: TiempoComida }

/** Semana (Director, Residente). `cierre` ya viene como texto: 'cierra hoy 10:00' o 'cerrada'. */
export type ComidaDeSemana = {
  comida: TiempoComida
  valor: ValorEfectivo
  plan: ValorComida | null
  abierta: boolean
  cierre: string
}
export type DiaDeSemana = { fecha: FechaISO; nombre: string; fechaCorta: string; esHoy: boolean; comidas: ComidaDeSemana[] }

/** Administración */
export type Persona = { id: string; nombre: string }
export type PersonaConPlan = Persona & { plan: PlanSemanal }
export type FilaDiaAdministracion = Persona & { valores: Record<TiempoComida, ValorEfectivo> }
export type DiaAdministracion = {
  fecha: FechaISO
  filas: FilaDiaAdministracion[]
  resumen: Record<TiempoComida, ResumenComida>
}

function clave(fecha: FechaISO, comida: TiempoComida): string {
  return `${fecha}|${comida}`
}

function aSeleccion(fila: FilaSeleccion | undefined): SeleccionGuardada | null {
  return fila ? { estado: fila.estado, nota: fila.nota, origen: fila.origen } : null
}

export function planDesdeFilas(filas: FilaPlan[]): PlanSemanal {
  const plan: PlanSemanal = {}
  for (const fila of filas) {
    const dia = (plan[fila.dia_semana] ??= {})
    dia[fila.comida] = { estado: fila.estado, nota: fila.nota }
  }
  return plan
}

export function armarSemanaPersona(p: {
  lunes: FechaISO
  ahora: Date
  horas: HorasLimite
  plan: PlanSemanal
  selecciones: FilaSeleccion[]
  cerradas: FilaCerrada[]
}): DiaDeSemana[] {
  const hoy = fechaISOEn(p.ahora)
  const selecciones = new Map(p.selecciones.map((fila) => [clave(fila.fecha, fila.comida), fila]))
  const cerradas = new Set(p.cerradas.map((fila) => clave(fila.fecha, fila.comida)))

  return diasDeSemana(p.lunes).map((fecha) => ({
    fecha,
    nombre: nombreDia(fecha),
    fechaCorta: fechaCorta(fecha),
    esHoy: fecha === hoy,
    comidas: TIEMPOS_COMIDA.map((comida) => {
      const cerrada = cerradas.has(clave(fecha, comida))
      const plan = p.plan[diaSemana(fecha)]?.[comida] ?? null
      const momento = { fecha, comida, ahora: p.ahora, horas: p.horas, cerrada }
      return {
        comida,
        valor: valorEfectivo({ seleccion: aSeleccion(selecciones.get(clave(fecha, comida))), plan, cerrada }),
        plan,
        abierta: estaAbierta(momento),
        cierre: textoCierre(momento),
      }
    }),
  }))
}

export function armarDiaAdministracion(p: {
  fecha: FechaISO
  personas: Persona[]
  planes: (FilaPlan & { usuario_id: string })[]
  selecciones: (FilaSeleccion & { usuario_id: string })[]
  cerradas: FilaCerrada[]
}): DiaAdministracion {
  const dia = diaSemana(p.fecha)
  const cerradas = new Set(p.cerradas.filter((fila) => fila.fecha === p.fecha).map((fila) => fila.comida))

  const filas = p.personas.map((persona) => {
    const valores = {} as Record<TiempoComida, ValorEfectivo>
    for (const comida of TIEMPOS_COMIDA) {
      const seleccion = p.selecciones.find(
        (fila) => fila.usuario_id === persona.id && fila.fecha === p.fecha && fila.comida === comida,
      )
      const plan = p.planes.find(
        (fila) => fila.usuario_id === persona.id && fila.dia_semana === dia && fila.comida === comida,
      )
      valores[comida] = valorEfectivo({
        seleccion: aSeleccion(seleccion),
        plan: plan ? { estado: plan.estado, nota: plan.nota } : null,
        cerrada: cerradas.has(comida),
      })
    }
    return { id: persona.id, nombre: persona.nombre, valores }
  })

  const resumen = {} as Record<TiempoComida, ResumenComida>
  for (const comida of TIEMPOS_COMIDA) resumen[comida] = resumenComida(filas.map((fila) => fila.valores[comida]))

  return { fecha: p.fecha, filas, resumen }
}

/** Valor optimista tras guardar: igual que guardar_seleccion, si coincide con el plan no es excepción. */
export function valorTrasGuardar(plan: ValorComida | null, valor: ValorComida): SeleccionGuardada {
  const igualAlPlan = plan !== null && plan.estado === valor.estado && plan.nota === valor.nota
  return { estado: valor.estado, nota: valor.nota, origen: igualAlPlan ? 'plan' : 'persona' }
}
