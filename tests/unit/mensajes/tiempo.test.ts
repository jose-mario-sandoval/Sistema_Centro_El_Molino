import { describe, expect, it } from 'vitest'
import { fechaHoraLocal, haceCuanto } from '@/lib/mensajes/tiempo'

describe('haceCuanto (timeAgo del prototipo)', () => {
  const ahora = new Date('2026-09-16T16:00:00Z')
  const antes = (ms: number) => new Date(ahora.getTime() - ms).toISOString()
  const MIN = 60_000
  const HORA = 60 * MIN

  it('menos de un minuto es "ahora"', () => {
    expect(haceCuanto(antes(0), ahora)).toBe('ahora')
    expect(haceCuanto(antes(59_999), ahora)).toBe('ahora')
  })

  it('un instante futuro (reloj adelantado) también es "ahora"', () => {
    expect(haceCuanto(antes(-5 * MIN), ahora)).toBe('ahora')
  })

  it('minutos, horas y días redondeando hacia abajo', () => {
    expect(haceCuanto(antes(MIN), ahora)).toBe('1 min')
    expect(haceCuanto(antes(59 * MIN + 59_000), ahora)).toBe('59 min')
    expect(haceCuanto(antes(HORA), ahora)).toBe('1 h')
    expect(haceCuanto(antes(23 * HORA + 59 * MIN), ahora)).toBe('23 h')
    expect(haceCuanto(antes(24 * HORA), ahora)).toBe('1 d')
    expect(haceCuanto(antes(20 * 24 * HORA), ahora)).toBe('20 d')
  })

  it('acepta marcas de Postgres con microsegundos y Date', () => {
    expect(haceCuanto('2026-09-16T15:55:00.123456+00:00', ahora)).toBe('4 min')
    expect(haceCuanto(new Date('2026-09-16T13:00:00Z'), ahora)).toBe('3 h')
  })
})

describe('fechaHoraLocal', () => {
  it('muestra DD/MM/AAAA HH:MM en hora de El Salvador', () => {
    expect(fechaHoraLocal('2026-09-17T05:30:00Z')).toBe('16/09/2026 23:30')
    expect(fechaHoraLocal('2026-09-16T06:05:00.5+00:00')).toBe('16/09/2026 00:05')
  })
})
