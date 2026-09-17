export const ZONA_HORARIA = 'America/El_Salvador'

/** Fecha de calendario 'YYYY-MM-DD' (igual que el tipo date de Postgres). */
export type FechaISO = string

const formateador = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_HORARIA,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

function partesEnZona(instante: Date) {
  const partes = Object.fromEntries(
    formateador.formatToParts(instante).map((p) => [p.type, p.value]),
  )
  return {
    anio: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
    segundo: Number(partes.second),
  }
}

function aNumeros(fecha: FechaISO): [number, number, number] {
  const [a, m, d] = fecha.split('-').map(Number)
  return [a, m, d]
}

function desdeUTC(ms: number): FechaISO {
  return new Date(ms).toISOString().slice(0, 10)
}

export function fechaISOEn(instante: Date): FechaISO {
  const p = partesEnZona(instante)
  return `${p.anio}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`
}

/** 1 = lunes … 7 = domingo */
export function diaSemana(fecha: FechaISO): number {
  const [a, m, d] = aNumeros(fecha)
  const dow = new Date(Date.UTC(a, m - 1, d)).getUTCDay()
  return dow === 0 ? 7 : dow
}

export function sumarDias(fecha: FechaISO, dias: number): FechaISO {
  const [a, m, d] = aNumeros(fecha)
  return desdeUTC(Date.UTC(a, m - 1, d + dias))
}

export function lunesDe(fecha: FechaISO): FechaISO {
  return sumarDias(fecha, 1 - diaSemana(fecha))
}

export function horaHHMM(hora: string): string {
  return hora.slice(0, 5)
}

/** Instante real que corresponde a `fecha` a la `hora` ('HH:MM' o 'HH:MM:SS') en ZONA_HORARIA. */
export function instanteEnZona(fecha: FechaISO, hora: string): Date {
  const [a, m, d] = aNumeros(fecha)
  const [hh, mm] = hora.split(':').map(Number)
  const supuesto = Date.UTC(a, m - 1, d, hh, mm)
  const p = partesEnZona(new Date(supuesto))
  const comoUTC = Date.UTC(p.anio, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo)
  const desfase = comoUTC - supuesto
  return new Date(supuesto - desfase)
}
