import { ETIQUETA_TIEMPO, type TiempoComida } from '@/lib/comidas/tipos'
import { diaSemana, fechaISOEn, sumarDias, ZONA_HORARIA, type FechaISO } from '@/lib/fechas'

/** JSON que recibe public/sw.js en el evento push. */
export type CargaPush = {
  titulo: string
  cuerpo: string
  url: string
  etiqueta: string
}

export const LARGO_MAXIMO_CUERPO = 120

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const

const formatoHora = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_HORARIA,
  hourCycle: 'h23',
  hour: '2-digit',
  minute: '2-digit',
})

/** Corta por caracteres completos (code points): cortar por índice partiría emojis y acentos compuestos. */
export function recortar(texto: string, maximo = LARGO_MAXIMO_CUERPO): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  const caracteres = Array.from(limpio)
  if (caracteres.length <= maximo) return limpio
  return `${caracteres.slice(0, maximo - 1).join('').trimEnd()}…`
}

function horaLocal(instante: Date): string {
  const partes = Object.fromEntries(formatoHora.formatToParts(instante).map((p) => [p.type, p.value]))
  return `${partes.hour}:${partes.minute}`
}

function nombreFecha(fecha: FechaISO): string {
  return `${DIAS[diaSemana(fecha) - 1]} ${Number(fecha.slice(8, 10))}`
}

function cuandoCierra(cierre: Date, ahora: Date): string {
  const dia = fechaISOEn(cierre)
  const hoy = fechaISOEn(ahora)
  if (dia === hoy) return 'hoy'
  if (dia === sumarDias(hoy, 1)) return 'mañana'
  return `el ${nombreFecha(dia)}`
}

export function cargaNuevaPublicacion(p: { id: string; autor: string; texto: string }): CargaPush {
  return {
    titulo: `${p.autor} publicó un mensaje`,
    cuerpo: recortar(p.texto),
    url: '/mensajes',
    etiqueta: `mensaje-${p.id}`,
  }
}

export function cargaNuevaRespuesta(p: { id: string; autor: string; texto: string }): CargaPush {
  return {
    titulo: `${p.autor} respondió en un hilo`,
    cuerpo: recortar(p.texto),
    url: '/mensajes',
    etiqueta: `mensaje-${p.id}`,
  }
}

export function cargaRecordatorio(p: { fecha: FechaISO; comida: TiempoComida; cierre: Date; ahora: Date }): CargaPush {
  return {
    titulo: `Falta definir: ${ETIQUETA_TIEMPO[p.comida]} del ${nombreFecha(p.fecha)}`,
    cuerpo: `Cierra ${cuandoCierra(p.cierre, p.ahora)} a las ${horaLocal(p.cierre)}. Elegí tu opción en Semana.`,
    url: '/comidas/semana',
    etiqueta: `recordatorio-${p.fecha}-${p.comida}`,
  }
}
