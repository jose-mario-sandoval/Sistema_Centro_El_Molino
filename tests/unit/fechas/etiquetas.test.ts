import { describe, expect, it } from 'vitest'
import { DIAS_SEMANA, MESES, etiquetaDiaLarga, etiquetaMesLarga } from '@/lib/fechas/etiquetas'
import { ZONA_HORARIA, instanteEnZona, sumarDias } from '@/lib/fechas'

// Lo que el servidor escribía antes con Intl: las etiquetas nuevas tienen que decir exactamente lo mismo.
const formatoMesIntl = new Intl.DateTimeFormat('es', { timeZone: ZONA_HORARIA, month: 'long', year: 'numeric' })
const formatoDiaIntl = new Intl.DateTimeFormat('es', {
  timeZone: ZONA_HORARIA,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})
const conMayuscula = (texto: string) => texto.charAt(0).toUpperCase() + texto.slice(1)

describe('etiquetas de fecha sin Intl', () => {
  it('meses y días de la semana, lunes primero', () => {
    expect(MESES).toHaveLength(12)
    expect(MESES[8]).toBe('septiembre')
    expect(DIAS_SEMANA).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'])
  })

  it('etiquetaMesLarga', () => {
    expect(etiquetaMesLarga('2026-09')).toBe('Septiembre de 2026')
    expect(etiquetaMesLarga('2027-01')).toBe('Enero de 2027')
  })

  it('etiquetaDiaLarga', () => {
    expect(etiquetaDiaLarga('2026-09-16')).toBe('Miércoles, 16 de septiembre de 2026')
    expect(etiquetaDiaLarga('2027-01-01')).toBe('Viernes, 1 de enero de 2027')
    expect(etiquetaDiaLarga('2028-02-29')).toBe('Martes, 29 de febrero de 2028')
  })

  it('cada día de 2026 a 2028 dice lo mismo que el formateador Intl de antes', () => {
    for (let fecha = '2026-01-01'; fecha <= '2028-12-31'; fecha = sumarDias(fecha, 1)) {
      const instante = instanteEnZona(fecha, '12:00')
      expect(etiquetaDiaLarga(fecha)).toBe(conMayuscula(formatoDiaIntl.format(instante)))
      if (fecha.endsWith('-15')) expect(etiquetaMesLarga(fecha.slice(0, 7))).toBe(conMayuscula(formatoMesIntl.format(instante)))
    }
  })
})
