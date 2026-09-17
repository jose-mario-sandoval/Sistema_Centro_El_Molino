import { ZONA_HORARIA } from '@/lib/fechas'

const MINUTO = 60_000

/** Igual que timeAgo del prototipo: 'ahora', '5 min', '3 h', '2 d'. */
export function haceCuanto(instante: string | Date, ahora: Date): string {
  const minutos = Math.floor((ahora.getTime() - new Date(instante).getTime()) / MINUTO)
  if (minutos < 1) return 'ahora'
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `${horas} h`
  return `${Math.floor(horas / 24)} d`
}

const formato = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_HORARIA,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

/** 'DD/MM/AAAA HH:MM' en ZONA_HORARIA. Determinista en servidor y navegador (sin depender del idioma del sistema). */
export function fechaHoraLocal(instante: string | Date): string {
  const p = Object.fromEntries(formato.formatToParts(new Date(instante)).map((x) => [x.type, x.value]))
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`
}
