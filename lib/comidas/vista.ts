import { estaAusente, type RangoAusencia } from '@/lib/ausencias/tipos'
import { diaSemana, fechaISOEn, type FechaISO } from '@/lib/fechas'
import { estaAbierta, VALOR_POR_AUSENCIA, valorEfectivo } from './reglas'
import { resumenComida, type ResumenComida } from './resumen'
import { diasDeSemana, fechaCorta, nombreDia, textoCierre } from './semana'
import {
  ETIQUETA_CORTA_ESTADO,
  ETIQUETA_TIEMPO,
  INFO_ESTADO,
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
  /** La persona está ausente ese día: la referencia de la comida es "No comer", no el plan. */
  ausente: boolean
  abierta: boolean
  cierre: string
}
export type DiaDeSemana = {
  fecha: FechaISO
  nombre: string
  fechaCorta: string
  esHoy: boolean
  ausente: boolean
  comidas: ComidaDeSemana[]
}

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
  /** Ausencias propias que tocan la semana. */
  ausencias?: readonly RangoAusencia[]
}): DiaDeSemana[] {
  const hoy = fechaISOEn(p.ahora)
  const selecciones = new Map(p.selecciones.map((fila) => [clave(fila.fecha, fila.comida), fila]))
  const cerradas = new Set(p.cerradas.map((fila) => clave(fila.fecha, fila.comida)))

  return diasDeSemana(p.lunes).map((fecha) => {
    const ausente = estaAusente(p.ausencias ?? [], fecha)
    return {
      fecha,
      nombre: nombreDia(fecha),
      fechaCorta: fechaCorta(fecha),
      esHoy: fecha === hoy,
      ausente,
      comidas: TIEMPOS_COMIDA.map((comida) => {
        const cerrada = cerradas.has(clave(fecha, comida))
        const plan = p.plan[diaSemana(fecha)]?.[comida] ?? null
        const momento = { fecha, comida, ahora: p.ahora, horas: p.horas, cerrada }
        return {
          comida,
          valor: valorEfectivo({ seleccion: aSeleccion(selecciones.get(clave(fecha, comida))), plan, cerrada, ausente }),
          plan,
          ausente,
          abierta: estaAbierta(momento),
          cierre: textoCierre(momento),
        }
      }),
    }
  })
}

export function armarDiaAdministracion(p: {
  fecha: FechaISO
  personas: Persona[]
  planes: (FilaPlan & { usuario_id: string })[]
  selecciones: (FilaSeleccion & { usuario_id: string })[]
  cerradas: FilaCerrada[]
  /** Ids de quienes están ausentes ese día (`ausentes_en`): para Administración solo importa que no comen. */
  ausentes?: readonly string[]
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
        ausente: (p.ausentes ?? []).includes(persona.id),
      })
    }
    return { id: persona.id, nombre: persona.nombre, valores }
  })

  const resumen = {} as Record<TiempoComida, ResumenComida>
  for (const comida of TIEMPOS_COMIDA) resumen[comida] = resumenComida(filas.map((fila) => fila.valores[comida]))

  return { fecha: p.fecha, filas, resumen }
}

/**
 * Valor optimista tras guardar: igual que guardar_seleccion, si coincide con la referencia no es
 * excepción. La referencia es el plan, o "No comer" si la persona está ausente ese día.
 */
export function valorTrasGuardar(plan: ValorComida | null, valor: ValorComida, ausente = false): SeleccionGuardada {
  const referencia = ausente ? VALOR_POR_AUSENCIA : plan
  const igual = referencia !== null && referencia.estado === valor.estado && referencia.nota === valor.nota
  if (!igual) return { estado: valor.estado, nota: valor.nota, origen: 'persona' }
  return { estado: valor.estado, nota: valor.nota, origen: ausente ? 'ausencia' : 'plan' }
}

/** Texto corto de una comida para celdas y tarjetas: siempre va junto al icono y el color del estado. */
export type TextoCorto = { estado: EstadoComida | null; texto: string; hora: string | null }

/** 'Temprano' + '07:30' · 'Sí' · 'Falta' (sin definir). La nota de enfermo no entra: es texto libre. */
export function textoCorto(valor: ValorComida | null): TextoCorto {
  if (!valor) return { estado: null, texto: 'Falta', hora: null }
  const hora = INFO_ESTADO[valor.estado].nota === 'hora' ? valor.nota : null
  return { estado: valor.estado, texto: ETIQUETA_CORTA_ESTADO[valor.estado], hora }
}

/** Para nombres accesibles: 'Comer temprano 07:30' · 'Enfermo, Sopa' · 'Falta, sin definir'. Contiene el corto. */
export function textoValor(valor: ValorComida | null): string {
  if (!valor) return 'Falta, sin definir'
  const { etiqueta, nota } = INFO_ESTADO[valor.estado]
  if (!valor.nota) return etiqueta
  return nota === 'hora' ? `${etiqueta} ${valor.nota}` : `${etiqueta}, ${valor.nota}`
}

export type LineaTarjeta = TextoCorto & { comida: TiempoComida; etiqueta: string }

/** Las tres líneas de la tarjeta de un día: 'Desayuno' + icono + 'Temprano 07:30'. */
export function lineasTarjeta(dia: DiaDeSemana): LineaTarjeta[] {
  return dia.comidas.map(({ comida, valor }) => ({ comida, etiqueta: ETIQUETA_TIEMPO[comida], ...textoCorto(valor) }))
}

/** Un día está cerrado cuando ya no se puede cambiar ninguna de sus comidas (pasado, o hoy tras la cena). */
export function diaCerrado(dia: DiaDeSemana): boolean {
  return dia.comidas.every((comida) => !comida.abierta)
}

/** Nombre accesible de la tarjeta: 'Miércoles 23/9, hoy. Desayuno: Sí comer. Almuerzo: …'. */
export function etiquetaTarjeta(dia: DiaDeSemana): string {
  const marcas = [dia.esHoy && 'hoy', dia.ausente && 'ausente', diaCerrado(dia) && 'cerrado'].filter(Boolean)
  const cabeza = [`${dia.nombre} ${dia.fechaCorta}`, ...marcas].join(', ')
  const comidas = dia.comidas.map(({ comida, valor }) => `${ETIQUETA_TIEMPO[comida]}: ${textoValor(valor)}.`)
  return `${cabeza}. ${comidas.join(' ')}`
}

/**
 * Qué día de la semana en curso se abre solo: hoy, o si hoy ya cerró entero, el primero que todavía
 * tenga algo por cambiar (DESIGN.md §8: lo primero en pantalla es algo que se puede cambiar).
 */
export function diaParaAbrir(dias: readonly DiaDeSemana[]): FechaISO | null {
  const hoy = dias.findIndex((dia) => dia.esHoy)
  if (hoy < 0) return null
  return dias.slice(hoy).find((dia) => !diaCerrado(dia))?.fecha ?? null
}

/** Lo único que cruza al navegador de Administración: nunca `filas`. */
export type DiaAgregado = { fecha: FechaISO; resumen: Record<TiempoComida, ResumenComida> }

export function agregarSemana(dias: readonly DiaAdministracion[]): DiaAgregado[] {
  return dias.map(({ fecha, resumen }) => ({ fecha, resumen }))
}

/**
 * Plan habitual agregado por día de semana (1=lunes…7=domingo) y tiempo de comida, sin nombres.
 * `origen: 'plan'` es solo para reutilizar resumenComida (que ignora el campo, pero el tipo lo exige).
 */
export function resumenPlanSemanal(personas: readonly PersonaConPlan[]): Record<number, Record<TiempoComida, ResumenComida>> {
  const semana = {} as Record<number, Record<TiempoComida, ResumenComida>>
  for (let dia = 1; dia <= 7; dia++) {
    semana[dia] = {} as Record<TiempoComida, ResumenComida>
    for (const comida of TIEMPOS_COMIDA) {
      const valores: ValorEfectivo[] = personas.map((persona) => {
        const valor = persona.plan[dia]?.[comida]
        return valor ? { ...valor, origen: 'plan' } : null
      })
      semana[dia][comida] = resumenComida(valores)
    }
  }
  return semana
}
