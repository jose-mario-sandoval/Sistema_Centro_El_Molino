import { describe, expect, it } from 'vitest'
import { HORAS_LIMITE_POR_DEFECTO, type HorasLimite } from '@/lib/comidas/tipos'
import { comidasPorAvisar, horasLimiteDesdeFilas, type ComidaFecha } from '@/lib/push/recordatorios'

type Exclusiones = { cerradas: ComidaFecha[]; avisadas: ComidaFecha[] }
const sinExclusiones: Exclusiones = { cerradas: [], avisadas: [] }

function avisar(ahora: string, horas: HorasLimite = HORAS_LIMITE_POR_DEFECTO, extra: Exclusiones = sinExclusiones) {
  return comidasPorAvisar({ ahora: new Date(ahora), horas, ...extra })
}

describe('horasLimiteDesdeFilas', () => {
  it('toma las filas de la base y recorta los segundos', () => {
    expect(horasLimiteDesdeFilas([{ comida: 'almuerzo', dia_relativo: -1, hora: '22:15:00' }])).toEqual({
      ...HORAS_LIMITE_POR_DEFECTO,
      almuerzo: { diaRelativo: -1, hora: '22:15' },
    })
  })

  it('sin filas usa los valores por defecto', () => {
    expect(horasLimiteDesdeFilas([])).toEqual(HORAS_LIMITE_POR_DEFECTO)
  })
})

describe('comidasPorAvisar', () => {
  it('avisa el almuerzo de hoy media hora antes del cierre', () => {
    expect(avisar('2026-09-16T09:30:00-06:00')).toEqual([
      { fecha: '2026-09-16', comida: 'almuerzo', cierre: new Date('2026-09-16T16:00:00.000Z') },
    ])
  })

  it('incluye un cierre a exactamente 60 minutos (desayuno de mañana)', () => {
    expect(avisar('2026-09-16T20:00:00-06:00')).toEqual([
      { fecha: '2026-09-17', comida: 'desayuno', cierre: new Date('2026-09-17T03:00:00.000Z') },
    ])
  })

  it('excluye un cierre a 61 minutos', () => {
    expect(avisar('2026-09-16T19:59:00-06:00')).toEqual([])
  })

  it('excluye un cierre que ocurre justo ahora', () => {
    expect(avisar('2026-09-16T21:00:00-06:00')).toEqual([])
  })

  it('omite comidas cerradas', () => {
    expect(
      avisar('2026-09-16T09:30:00-06:00', HORAS_LIMITE_POR_DEFECTO, {
        cerradas: [{ fecha: '2026-09-16', comida: 'almuerzo' }],
        avisadas: [],
      }),
    ).toEqual([])
  })

  it('omite comidas ya avisadas', () => {
    expect(
      avisar('2026-09-16T09:30:00-06:00', HORAS_LIMITE_POR_DEFECTO, {
        cerradas: [],
        avisadas: [{ fecha: '2026-09-16', comida: 'almuerzo' }],
      }),
    ).toEqual([])
  })

  it('domingo 23:45: avisa el desayuno del martes si cierra el lunes 00:30', () => {
    const horas: HorasLimite = { ...HORAS_LIMITE_POR_DEFECTO, desayuno: { diaRelativo: -1, hora: '00:30' } }
    expect(avisar('2026-09-20T23:45:00-06:00', horas)).toEqual([
      { fecha: '2026-09-22', comida: 'desayuno', cierre: new Date('2026-09-21T06:30:00.000Z') },
    ])
  })

  it('usa la fecha local y no la UTC', () => {
    // 05:30 UTC del 17 = 23:30 del 16 en El Salvador
    const horas: HorasLimite = { ...HORAS_LIMITE_POR_DEFECTO, cena: { diaRelativo: 0, hora: '23:59' } }
    expect(avisar('2026-09-17T05:30:00Z', horas)).toEqual([
      { fecha: '2026-09-16', comida: 'cena', cierre: new Date('2026-09-17T05:59:00.000Z') },
    ])
  })

  it('ordena por hora de cierre', () => {
    const horas: HorasLimite = { ...HORAS_LIMITE_POR_DEFECTO, desayuno: { diaRelativo: 0, hora: '10:30' } }
    expect(avisar('2026-09-16T09:45:00-06:00', horas).map((c) => c.comida)).toEqual(['almuerzo', 'desayuno'])
  })
})
