import { describe, expect, it } from 'vitest'
import {
  ZONA_HORARIA,
  diaSemana,
  fechaISOEn,
  horaHHMM,
  instanteEnZona,
  lunesDe,
  sumarDias,
  sumarMeses,
} from '@/lib/fechas'

describe('lib/fechas', () => {
  it('usa la zona horaria de El Salvador', () => {
    expect(ZONA_HORARIA).toBe('America/El_Salvador')
  })

  it('fechaISOEn devuelve la fecha local, no la UTC', () => {
    // 05:30 UTC del 17 = 23:30 del 16 en El Salvador
    expect(fechaISOEn(new Date('2026-09-17T05:30:00Z'))).toBe('2026-09-16')
    expect(fechaISOEn(new Date('2026-09-17T06:00:00Z'))).toBe('2026-09-17')
  })

  it('diaSemana devuelve 1 = lunes … 7 = domingo', () => {
    expect(diaSemana('2026-09-14')).toBe(1)
    expect(diaSemana('2026-09-16')).toBe(3)
    expect(diaSemana('2026-09-20')).toBe(7)
  })

  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-09-30', 1)).toBe('2026-10-01')
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31')
    expect(sumarDias('2026-09-14', 13)).toBe('2026-09-27')
  })

  it.each([
    ['2026-09-16', 3, '2026-12-16'],
    ['2026-10-31', 3, '2027-01-31'],
    ['2026-12-31', 3, '2027-03-31'],
    ['2026-01-31', 3, '2026-04-30'],
    ['2026-08-31', 3, '2026-11-30'],
    ['2026-11-30', 3, '2027-02-28'],
    ['2027-11-30', 3, '2028-02-29'],
    ['2028-02-29', 12, '2029-02-28'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-09-16', 0, '2026-09-16'],
    ['2026-03-31', -1, '2026-02-28'],
  ] as const)('sumarMeses(%s, %s) conserva el día o usa el último del mes: %s', (fecha, meses, esperado) => {
    expect(sumarMeses(fecha, meses)).toBe(esperado)
  })

  it('lunesDe devuelve el lunes de la semana', () => {
    expect(lunesDe('2026-09-20')).toBe('2026-09-14')
    expect(lunesDe('2026-09-14')).toBe('2026-09-14')
    expect(lunesDe('2026-09-21')).toBe('2026-09-21')
  })

  it('instanteEnZona interpreta fecha y hora en El Salvador', () => {
    expect(instanteEnZona('2026-09-16', '21:00').toISOString()).toBe('2026-09-17T03:00:00.000Z')
    expect(instanteEnZona('2026-09-16', '10:00:00').toISOString()).toBe('2026-09-16T16:00:00.000Z')
  })

  it('horaHHMM recorta segundos', () => {
    expect(horaHHMM('21:00:00')).toBe('21:00')
    expect(horaHHMM('07:05')).toBe('07:05')
  })
})
