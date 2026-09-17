import { TIEMPOS_COMIDA, type HoraLimite, type HorasLimite, type TiempoComida } from '@/lib/comidas/tipos'
import { horaHHMM } from '@/lib/fechas'

/** Forma de una fila de `horas_limite` tal como la devuelve Supabase. */
export type FilaHoraLimite = { comida: TiempoComida; dia_relativo: number; hora: string }

export function horasLimiteDesdeFilas(filas: FilaHoraLimite[]): HorasLimite {
  const horas = {} as HorasLimite
  for (const comida of TIEMPOS_COMIDA) {
    const fila = filas.find((f) => f.comida === comida)
    if (!fila) throw new Error(`Falta la hora límite de ${comida}.`)
    horas[comida] = { diaRelativo: fila.dia_relativo === -1 ? -1 : 0, hora: horaHHMM(fila.hora) }
  }
  return horas
}

/** "cierra el mismo día a las 10:00" / "cierra el día anterior a las 21:00". */
export function describirCierre({ diaRelativo, hora }: HoraLimite): string {
  return `cierra ${diaRelativo === -1 ? 'el día anterior' : 'el mismo día'} a las ${horaHHMM(hora)}`
}
