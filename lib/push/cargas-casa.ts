import { REQUERIMIENTOS_COCINA, textoPedido, type EventoParaCocina } from '@/lib/calendario/tipos'
import { textoCantidadExtra } from '@/lib/comidas/casa'
import { diaPlural } from '@/lib/comidas/plan'
import { cierreDe } from '@/lib/comidas/reglas'
import { fechaCorta, nombreDia } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, type HorasLimite, type TiempoComida, type ValorComida } from '@/lib/comidas/tipos'
import { textoValor } from '@/lib/comidas/vista'
import { fechaISOEn, horaHHMM, lunesDe, sumarDias, type FechaISO } from '@/lib/fechas'
import { rangoLegible } from '@/lib/fechas/rango'
import { recortar, type CargaPush } from './mensajes-push'

/*
 * Textos de los avisos de "la casa": lo que el Director cambió de una persona (c) y lo que cambió
 * para la cocina (d). Puros y sin `Intl`: las fechas salen de lib/fechas y lib/comidas.
 *
 * Los de la cocina reciben solo lo que Administración puede ver (fecha, hora, comida, cantidad,
 * pedido o nota): nunca un título, una categoría ni un nombre (CLAUDE.md, `eventos_para_cocina()`).
 */

// ---------- (c) El Director cambió algo tuyo ----------

/** Cómo quedó la comida: elegida por el Director, o de vuelta a lo del plan o la ausencia. */
export type ResultadoComida = { valor: ValorComida | null; origen: 'persona' | 'plan' | 'ausencia' }

function textoResultado({ valor, origen }: ResultadoComida): string {
  if (origen === 'persona') return valor ? `Ahora: ${textoValor(valor)}.` : 'Ahora: sin definir.'
  if (!valor) return 'Volvió a tu plan, que no dice nada para esa comida: quedó sin definir.'
  return `Volvió a tu ${origen === 'ausencia' ? 'ausencia' : 'plan'}: ${textoValor(valor)}.`
}

/** 'El Director cambió tu almuerzo del miércoles 30/9' · 'Ahora: Comer temprano 12:00.' */
export function cargaCambioComida(p: {
  personaId: string
  fecha: FechaISO
  comida: TiempoComida
  resultado: ResultadoComida
}): CargaPush {
  return {
    titulo: `El Director cambió tu ${ETIQUETA_TIEMPO[p.comida].toLowerCase()} del ${nombreDia(p.fecha).toLowerCase()} ${fechaCorta(p.fecha)}`,
    cuerpo: textoResultado(p.resultado),
    url: `/comidas/semana?semana=${lunesDe(p.fecha)}`,
    // Por persona y por tipo: si el Director cambia varias comidas seguidas, queda el último aviso.
    etiqueta: `cambio-comida-${p.personaId}`,
  }
}

/** 'El Director cambió tu plan de los martes' · 'Almuerzo: En bolsa.' (`valor` null = sin definir). */
export function cargaCambioPlan(p: {
  personaId: string
  diaSemana: number
  comida: TiempoComida
  valor: ValorComida | null
}): CargaPush {
  return {
    titulo: `El Director cambió tu plan de los ${diaPlural(p.diaSemana)}`,
    cuerpo: `${ETIQUETA_TIEMPO[p.comida]}: ${p.valor ? textoValor(p.valor) : 'sin definir'}.`,
    // En el plan está la marca "Director" en la celda que cambió.
    url: '/comidas/plan',
    etiqueta: `cambio-plan-${p.personaId}`,
  }
}

/** 'El Director marcó una ausencia del 5 al 9 de octubre' · 'El Director quitó tu ausencia del 5 de octubre'. */
export function cargaAusencia(p: {
  personaId: string
  desde: FechaISO
  hasta: FechaISO
  accion: 'marcada' | 'quitada'
}): CargaPush {
  const rango = rangoLegible(p.desde, p.hasta)
  const unDia = p.desde === p.hasta
  const dias = unDia ? 'ese día' : 'esos días'
  return {
    titulo:
      p.accion === 'marcada'
        ? `El Director marcó una ausencia ${unDia ? 'para el' : 'del'} ${rango}`
        : `El Director quitó tu ausencia del ${rango}`,
    cuerpo: p.accion === 'marcada' ? `Tus comidas de ${dias} quedan canceladas.` : `Tus comidas de ${dias} vuelven a tu plan.`,
    url: `/calendario?mes=${p.desde.slice(0, 7)}`,
    etiqueta: `cambio-ausencia-${p.personaId}`,
  }
}

// ---------- (d) Cambios para la cocina ----------

/**
 * ¿Es de último momento? Hoy, o ya pasó la hora límite de esa comida (el desayuno cierra la noche
 * anterior): la cocina puede no verlo a tiempo si no se le avisa.
 */
export function esUltimoMomento(p: { fecha: FechaISO; comida: TiempoComida; ahora: Date; horas: HorasLimite }): boolean {
  if (p.fecha <= fechaISOEn(p.ahora)) return true
  return p.ahora.getTime() >= cierreDe(p.fecha, p.comida, p.horas).getTime()
}

/** 'Hoy' · 'Mañana' · 'Jueves 1/10' */
function cuando(fecha: FechaISO, hoy: FechaISO): string {
  if (fecha === hoy) return 'Hoy'
  if (fecha === sumarDias(hoy, 1)) return 'Mañana'
  return `${nombreDia(fecha)} ${fechaCorta(fecha)}`
}

/** 'Almuerzo de hoy' · 'Desayuno de mañana' · 'Almuerzo del jueves 1/10' */
function queComida(fecha: FechaISO, comida: TiempoComida, hoy: FechaISO): string {
  const etiqueta = ETIQUETA_TIEMPO[comida]
  if (fecha === hoy) return `${etiqueta} de hoy`
  if (fecha === sumarDias(hoy, 1)) return `${etiqueta} de mañana`
  return `${etiqueta} del ${nombreDia(fecha).toLowerCase()} ${fechaCorta(fecha)}`
}

/**
 * Un extra manual agregado o quitado. La etiqueta es por comida (el aviso nuevo reemplaza al
 * anterior), por eso el texto dice el total de extras que quedó para esa comida.
 */
export function cargaExtraCocina(p: {
  fecha: FechaISO
  comida: TiempoComida
  cantidad: number
  nota: string | null
  accion: 'agregado' | 'quitado'
  /** Personas extra (manuales) que quedaron para esa comida después del cambio. */
  total: number
  ultimoMomento: boolean
  hoy: FechaISO
}): CargaPush {
  const agregado = p.accion === 'agregado'
  const titulo = agregado
    ? p.ultimoMomento
      ? 'Extra de último momento'
      : 'Extra para la cocina'
    : p.ultimoMomento
      ? 'Extra quitado a último momento'
      : 'Se quitó un extra'
  const cambio = `${textoCantidadExtra(p.cantidad)} ${agregado ? 'más' : 'menos'}`
  const nota = agregado && p.nota ? ` (${p.nota})` : ''
  const total = p.total > 0 ? `Total de extras: ${textoCantidadExtra(p.total)}.` : 'Ya no quedan extras.'
  return {
    titulo,
    cuerpo: recortar(`${queComida(p.fecha, p.comida, p.hoy)}: ${cambio}${nota}. ${total}`),
    url: `/comidas/semana?semana=${lunesDe(p.fecha)}`,
    etiqueta: `cocina-extras-${p.fecha}-${p.comida}`,
  }
}

/** Lo que la cocina sabe de un evento (`eventos_para_cocina()` sin el id): cuándo y qué preparar. */
export type PedidoCocina = Omit<EventoParaCocina, 'id'>

function textoLibre(texto: string | null): string | null {
  const limpio = texto?.trim() ?? ''
  return limpio === '' ? null : limpio
}

/** El evento le pide algo a la cocina (una casilla o el pedido libre). */
export function pideALaCocina(e: PedidoCocina): boolean {
  return e.requiere_cocina.length > 0 || textoLibre(e.requiere_otro_texto) !== null
}

/**
 * De un evento completo (con título, tipo, serie…), solo lo que la cocina puede saber. Las acciones
 * pasan por acá antes de programar el aviso: así el título ni siquiera llega a la función que lo arma.
 */
export function paraCocina(e: PedidoCocina): PedidoCocina {
  return { fecha: e.fecha, hora: e.hora, requiere_cocina: e.requiere_cocina, requiere_otro_texto: e.requiere_otro_texto }
}

/** Le importa a la cocina: pide algo y es de hoy en adelante. */
export function importaALaCocina(e: PedidoCocina, hoy: FechaISO): boolean {
  return pideALaCocina(e) && e.fecha >= hoy
}

function pedidoDe(e: PedidoCocina): string {
  const ordenados = REQUERIMIENTOS_COCINA.filter((r) => e.requiere_cocina.includes(r))
  return textoPedido(ordenados, textoLibre(e.requiere_otro_texto))
}

function horaDe(e: PedidoCocina): string | null {
  return e.hora ? horaHHMM(e.hora) : null
}

/** 'Jueves 1/10, 15:00' · 'Hoy' */
function cuandoHora(e: PedidoCocina, hoy: FechaISO): string {
  const hora = horaDe(e)
  return hora ? `${cuando(e.fecha, hoy)}, ${hora}` : cuando(e.fecha, hoy)
}

/** 'Jueves 1/10, 15:00: Merienda · 20 sillas' */
function textoEvento(e: PedidoCocina, hoy: FechaISO): string {
  return `${cuandoHora(e, hoy)}: ${pedidoDe(e)}`
}

function enMinuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1)
}

export type CambioPedido = 'nuevo' | 'cambiado' | 'cancelado'

/**
 * Qué cambió para la cocina entre `antes` y `despues` (null = el evento no existe). Solo cuenta un
 * evento con pedido y de hoy en adelante; un cambio de título o categoría no le cambia nada.
 */
export function cambioPedidoCocina(antes: PedidoCocina | null, despues: PedidoCocina | null, hoy: FechaISO): CambioPedido | null {
  const cuenta = (e: PedidoCocina | null): e is PedidoCocina => e !== null && importaALaCocina(e, hoy)
  const a = cuenta(antes)
  const d = cuenta(despues)
  if (!a && !d) return null
  if (!a) return 'nuevo'
  if (!d) return 'cancelado'
  const igual = antes!.fecha === despues!.fecha && horaDe(antes!) === horaDe(despues!) && pedidoDe(antes!) === pedidoDe(despues!)
  return igual ? null : 'cambiado'
}

/** Un evento con pedido nuevo, cambiado o cancelado. */
export function cargaPedidoCocina(p: {
  id: string
  tipo: CambioPedido
  antes: PedidoCocina | null
  despues: PedidoCocina | null
  hoy: FechaISO
}): CargaPush {
  const { antes, despues, hoy } = p
  let titulo: string
  let cuerpo: string
  if (p.tipo === 'nuevo' && despues) {
    titulo = 'Nuevo pedido para la cocina'
    cuerpo = `${textoEvento(despues, hoy)}.`
  } else if (p.tipo === 'cancelado' && antes) {
    titulo = 'Se canceló un pedido para la cocina'
    cuerpo = `${textoEvento(antes, hoy)}.`
  } else if (antes && despues) {
    titulo = 'Cambió un pedido para la cocina'
    const mismoPedido = pedidoDe(antes) === pedidoDe(despues)
    const mismoCuando = antes.fecha === despues.fecha && horaDe(antes) === horaDe(despues)
    if (mismoPedido) {
      cuerpo = `Ahora: ${textoEvento(despues, hoy)} (antes: ${enMinuscula(cuandoHora(antes, hoy))}).`
    } else if (mismoCuando) {
      cuerpo = `${cuandoHora(despues, hoy)}: ahora ${pedidoDe(despues)} (antes: ${pedidoDe(antes)}).`
    } else {
      cuerpo = `Ahora: ${textoEvento(despues, hoy)}. Antes: ${textoEvento(antes, hoy)}.`
    }
  } else {
    throw new Error(`cargaPedidoCocina: faltan datos para "${p.tipo}"`)
  }
  const referencia = despues ?? antes!
  return {
    titulo,
    cuerpo: recortar(cuerpo),
    url: `/calendario?mes=${referencia.fecha.slice(0, 7)}`,
    etiqueta: `cocina-evento-${p.id}`,
  }
}

/**
 * Una serie creada o cancelada, en un solo aviso: cuántas fechas, desde cuándo hasta cuándo y, si
 * todas coinciden, a qué hora y qué pedido. `pedidos` son solo los que le importan a la cocina.
 */
export function cargaSeriePedidos(p: { serieId: string; accion: 'creada' | 'cancelada'; pedidos: PedidoCocina[] }): CargaPush {
  const pedidos = [...p.pedidos].sort((a, b) => a.fecha.localeCompare(b.fecha))
  const n = pedidos.length
  const primera = pedidos[0].fecha
  const ultima = pedidos[n - 1].fecha
  const titulo =
    p.accion === 'creada'
      ? n === 1
        ? 'Se agregó 1 evento con pedido a cocina'
        : `Se agregaron ${n} eventos con pedido a cocina`
      : n === 1
        ? 'Se canceló 1 evento con pedido a cocina'
        : `Se cancelaron ${n} eventos con pedido a cocina`

  const rango = n === 1 ? `El ${rangoLegible(primera, primera)}` : `Del ${rangoLegible(primera, ultima)}`
  const horas = new Set(pedidos.map(horaDe))
  const textos = new Set(pedidos.map(pedidoDe))
  const hora = horas.size === 1 && pedidos[0].hora ? `, a las ${horaDe(pedidos[0])}` : ''
  const cuerpo =
    textos.size === 1
      ? `${rango}${hora}: ${pedidoDe(pedidos[0])}.`
      : `${rango}: pedidos distintos, miralos en el calendario.`
  return {
    titulo,
    cuerpo: recortar(cuerpo),
    url: `/calendario?mes=${primera.slice(0, 7)}`,
    etiqueta: `cocina-serie-${p.serieId}`,
  }
}
