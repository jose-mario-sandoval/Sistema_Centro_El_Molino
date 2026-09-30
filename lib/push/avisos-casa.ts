import 'server-only'
import { VALOR_POR_AUSENCIA } from '@/lib/comidas/reglas'
import type { TiempoComida, ValorComida } from '@/lib/comidas/tipos'
import { diaSemana, fechaISOEn, type FechaISO } from '@/lib/fechas'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { leerPerfiles } from './avisos'
import {
  cambioPedidoCocina,
  cargaAusencia,
  cargaCambioComida,
  cargaCambioPlan,
  cargaExtraCocina,
  cargaPedidoCocina,
  cargaSeriePedidos,
  esUltimoMomento,
  importaALaCocina,
  paraCocina,
  type PedidoCocina,
  type ResultadoComida,
} from './cargas-casa'
import { destinatarioCambio, destinatariosCocina } from './destinatarios'
import { enviarAUsuarios } from './enviar'
import { horasLimiteDesdeFilas } from './recordatorios'

/*
 * Avisos de "la casa": lo que el Director cambió de otra persona (c) y los cambios para la cocina (d).
 * Como los de lib/push/avisos.ts, nunca lanzan: corren dentro de after(), con la respuesta ya
 * enviada, y los errores quedan en los logs de Vercel (spec §9.1).
 */

type Actor = { personaId: string; actorId: string }

/** Lo que el Director cambió de otra persona (La casa, o el panel de ausencias del calendario). */
export type CambioDelDirector =
  | (Actor & { tipo: 'comida'; fecha: FechaISO; comida: TiempoComida; eleccion: ValorComida | 'volver' })
  | (Actor & { tipo: 'plan'; diaSemana: number; comida: TiempoComida; valor: ValorComida | null })
  | (Actor & { tipo: 'ausencia'; desde: FechaISO; hasta: FechaISO; accion: 'marcada' | 'quitada' })

/** Después de "Volver a su plan": la ausencia manda sobre el plan (lib/comidas/reglas.ts). */
async function resultadoDeVolver(personaId: string, fecha: FechaISO, comida: TiempoComida): Promise<ResultadoComida> {
  const admin = crearClienteAdmin()
  const [ausencia, plan] = await Promise.all([
    admin.from('ausencias').select('id').eq('usuario_id', personaId).lte('desde', fecha).gte('hasta', fecha),
    admin
      .from('plan_semanal')
      .select('estado, nota')
      .eq('usuario_id', personaId)
      .eq('dia_semana', diaSemana(fecha))
      .eq('comida', comida)
      .maybeSingle(),
  ])
  if (ausencia.error) throw ausencia.error
  if (plan.error) throw plan.error
  if (ausencia.data.length > 0) return { valor: VALOR_POR_AUSENCIA, origen: 'ausencia' }
  return { valor: plan.data, origen: 'plan' }
}

/** "El Director cambió tu…": a la persona, si no fue ella misma y quiere el aviso. */
export async function avisarCambioDelDirector(cambio: CambioDelDirector): Promise<void> {
  try {
    const perfiles = await leerPerfiles()
    const ids = destinatarioCambio({ personaId: cambio.personaId, actorId: cambio.actorId, perfiles })
    if (ids.length === 0) return

    let carga
    if (cambio.tipo === 'comida') {
      const resultado: ResultadoComida =
        cambio.eleccion === 'volver'
          ? await resultadoDeVolver(cambio.personaId, cambio.fecha, cambio.comida)
          : { valor: cambio.eleccion, origen: 'persona' }
      carga = cargaCambioComida({ personaId: cambio.personaId, fecha: cambio.fecha, comida: cambio.comida, resultado })
    } else if (cambio.tipo === 'plan') {
      carga = cargaCambioPlan(cambio)
    } else {
      carga = cargaAusencia(cambio)
    }

    const resumen = await enviarAUsuarios(ids, carga)
    console.log('[push] cambio del Director', { tipo: cambio.tipo, destinatarios: ids.length, ...resumen })
  } catch (error) {
    console.error('[push] aviso de cambio del Director', { tipo: cambio.tipo, error })
  }
}

/** Un extra manual agregado o quitado: a Administración, con el total que quedó para esa comida. */
export async function avisarExtraCocina(p: {
  actorId: string
  fecha: FechaISO
  comida: TiempoComida
  cantidad: number
  nota: string | null
  accion: 'agregado' | 'quitado'
}): Promise<void> {
  try {
    const ahora = new Date()
    const hoy = fechaISOEn(ahora)
    if (p.fecha < hoy) return

    const perfiles = await leerPerfiles()
    const ids = destinatariosCocina({ actorId: p.actorId, perfiles })
    if (ids.length === 0) return

    const admin = crearClienteAdmin()
    const [horas, extras] = await Promise.all([
      admin.from('horas_limite').select('comida, dia_relativo, hora'),
      admin.from('extras_manuales').select('cantidad').eq('fecha', p.fecha).eq('tiempo_comida', p.comida),
    ])
    if (horas.error) throw horas.error
    if (extras.error) throw extras.error

    const carga = cargaExtraCocina({
      ...p,
      total: extras.data.reduce((suma, extra) => suma + extra.cantidad, 0),
      ultimoMomento: esUltimoMomento({ fecha: p.fecha, comida: p.comida, ahora, horas: horasLimiteDesdeFilas(horas.data) }),
      hoy,
    })
    const resumen = await enviarAUsuarios(ids, carga)
    console.log('[push] extra para la cocina', { accion: p.accion, destinatarios: ids.length, ...resumen })
  } catch (error) {
    console.error('[push] aviso de extra para la cocina', { accion: p.accion, error })
  }
}

/**
 * Un evento creado, editado o borrado: avisa a Administración solo si cambió algo para la cocina
 * (el pedido, la fecha o la hora). `antes`/`despues` pueden traer el evento entero: pasa por
 * `paraCocina()` y el título, la categoría o quien lo creó nunca llegan al texto.
 */
export async function avisarPedidoCocina(p: {
  actorId: string
  eventoId: string
  antes: PedidoCocina | null
  despues: PedidoCocina | null
}): Promise<void> {
  try {
    const hoy = fechaISOEn(new Date())
    const antes = p.antes && paraCocina(p.antes)
    const despues = p.despues && paraCocina(p.despues)
    const tipo = cambioPedidoCocina(antes, despues, hoy)
    if (!tipo) return

    const perfiles = await leerPerfiles()
    const ids = destinatariosCocina({ actorId: p.actorId, perfiles })
    if (ids.length === 0) return

    const resumen = await enviarAUsuarios(ids, cargaPedidoCocina({ id: p.eventoId, tipo, antes, despues, hoy }))
    console.log('[push] pedido para la cocina', { tipo, destinatarios: ids.length, ...resumen })
  } catch (error) {
    console.error('[push] aviso de pedido para la cocina', { eventoId: p.eventoId, error })
  }
}

/** Una serie creada o cancelada: un solo aviso con las fechas que le importan a la cocina. */
export async function avisarSerieCocina(p: {
  actorId: string
  serieId: string
  accion: 'creada' | 'cancelada'
  pedidos: PedidoCocina[]
}): Promise<void> {
  try {
    const hoy = fechaISOEn(new Date())
    const pedidos = p.pedidos.map(paraCocina).filter((e) => importaALaCocina(e, hoy))
    if (pedidos.length === 0) return

    const perfiles = await leerPerfiles()
    const ids = destinatariosCocina({ actorId: p.actorId, perfiles })
    if (ids.length === 0) return

    const resumen = await enviarAUsuarios(ids, cargaSeriePedidos({ serieId: p.serieId, accion: p.accion, pedidos }))
    console.log('[push] serie para la cocina', { accion: p.accion, fechas: pedidos.length, destinatarios: ids.length, ...resumen })
  } catch (error) {
    console.error('[push] aviso de serie para la cocina', { serieId: p.serieId, error })
  }
}
