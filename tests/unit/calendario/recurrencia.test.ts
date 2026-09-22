import { describe, expect, it } from 'vitest'
import { diasEntre, generarFechasSerie } from '@/lib/calendario/recurrencia'

describe('generarFechasSerie: semanal', () => {
  it('genera cada semana en el día pedido, desde el primer día que coincide', () => {
    // 2026-10-07 es miércoles; el primer sábado desde ahí es 2026-10-10.
    const fechas = generarFechasSerie({ patron: 'semanal', diaSemana: 6 }, '2026-10-07', '2026-10-31')
    expect(fechas).toEqual(['2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31'])
  })

  it('si fechaInicio ya es el día pedido, lo incluye', () => {
    const fechas = generarFechasSerie({ patron: 'semanal', diaSemana: 3 }, '2026-10-07', '2026-10-07')
    expect(fechas).toEqual(['2026-10-07'])
  })

  it('sin ninguna coincidencia en el rango, lista vacía', () => {
    const fechas = generarFechasSerie({ patron: 'semanal', diaSemana: 6 }, '2026-10-07', '2026-10-08')
    expect(fechas).toEqual([])
  })
})

describe('generarFechasSerie: mensual_dia_fijo', () => {
  it('el mismo día de cada mes', () => {
    const fechas = generarFechasSerie({ patron: 'mensual_dia_fijo', diaMes: 15 }, '2026-10-01', '2027-01-31')
    expect(fechas).toEqual(['2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15'])
  })

  it('el 31 se omite en los meses que no llegan a 31 (no se corre de día)', () => {
    const fechas = generarFechasSerie({ patron: 'mensual_dia_fijo', diaMes: 31 }, '2026-10-01', '2027-01-31')
    expect(fechas).toEqual(['2026-10-31', '2026-12-31', '2027-01-31']) // noviembre tiene 30, se omite
  })

  it('el 29 de febrero solo aparece en año bisiesto', () => {
    const fechas = generarFechasSerie({ patron: 'mensual_dia_fijo', diaMes: 29 }, '2027-01-01', '2028-03-31')
    expect(fechas).toContain('2028-02-29') // 2028 es bisiesto
    expect(fechas).not.toContain('2027-02-29')
  })

  it('respeta fechaInicio y fechaFin dentro del primer y último mes', () => {
    const fechas = generarFechasSerie({ patron: 'mensual_dia_fijo', diaMes: 5 }, '2026-10-10', '2026-12-03')
    expect(fechas).toEqual(['2026-11-05']) // el 5/10 ya pasó, el 5/12 es después del fin
  })
})

describe('generarFechasSerie: mensual_dia_semana', () => {
  it('el primer lunes de cada mes', () => {
    const fechas = generarFechasSerie({ patron: 'mensual_dia_semana', diaSemana: 1, ordinalSemana: 1 }, '2026-10-01', '2027-01-31')
    expect(fechas).toEqual(['2026-10-05', '2026-11-02', '2026-12-07', '2027-01-04'])
  })

  it('el último viernes de cada mes', () => {
    const fechas = generarFechasSerie({ patron: 'mensual_dia_semana', diaSemana: 5, ordinalSemana: -1 }, '2026-10-01', '2026-12-31')
    expect(fechas).toEqual(['2026-10-30', '2026-11-27', '2026-12-25'])
  })

  it('el cuarto miércoles del mes', () => {
    // Nota: no hay caso de "se omite" que probar con datos válidos — ordinalSemana es 1|2|3|4|-1
    // (mismas opciones que ofrece el select del formulario) y todo mes tiene al menos 28 días, así
    // que la 4ª ocurrencia de cualquier día de semana siempre cae dentro del mes (día ≤ 28). La rama
    // que devuelve null en enesimoDiaSemanaDelMes es una defensa que este patrón nunca dispara con
    // las opciones que la UI permite elegir.
    const fechas = generarFechasSerie({ patron: 'mensual_dia_semana', diaSemana: 3, ordinalSemana: 4 }, '2026-10-01', '2026-10-31')
    expect(fechas).toEqual(['2026-10-28'])
  })
})

describe('diasEntre', () => {
  it('cuenta los días entre dos fechas, incluidos ambos extremos menos uno', () => {
    expect(diasEntre('2026-10-01', '2026-10-01')).toBe(0)
    expect(diasEntre('2026-10-01', '2026-10-08')).toBe(7)
  })
})
