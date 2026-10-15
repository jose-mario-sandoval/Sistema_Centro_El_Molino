import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AsistentesAdministracion } from '@/app/(app)/comidas/_componentes/asistentes-administracion'
import { resumenConAsistentes, totalQueComen } from '@/lib/comidas/resumen'
import { ESTADOS_COMIDA, TIEMPOS_COMIDA } from '@/lib/comidas/tipos'
import { agregarSemana, armarDiaAdministracion, resumenPlanSemanal } from '@/lib/comidas/vista'
import { esquemaNotaDieta } from '@/lib/validacion/comidas'

describe('asistentes de Administración', () => {
  const personas = [
    { id: 'a', siglas: 'AA', nombre: 'Nombre secreto A', notaDieta: 'Indicación general A' },
    { id: 'b', siglas: 'BB', nombre: 'Nombre secreto B', notaDieta: 'Indicación general B' },
    { id: 'c', siglas: 'CC', nombre: 'Nombre secreto C' },
    { id: 'd', siglas: 'DD', nombre: 'Nombre secreto D' },
  ]
  const planes = personas.map(({ id }) => ({ usuario_id: id, dia_semana: 3, comida: 'almuerzo' as const, estado: 'si' as const, nota: null }))
  const dia = armarDiaAdministracion({
    fecha: '2026-10-14', personas, planes,
    selecciones: [
      { usuario_id: 'a', fecha: '2026-10-14', comida: 'almuerzo', estado: 'enfermo', nota: 'Indicación puntual', origen: 'persona' },
      { usuario_id: 'b', fecha: '2026-10-14', comida: 'almuerzo', estado: 'bolsa', nota: null, origen: 'persona' },
      { usuario_id: 'a', fecha: '2026-10-14', comida: 'cena', estado: 'si', nota: null, origen: 'plan' },
    ],
    ausentes: ['a', 'b', 'c'],
    cerradas: [{ fecha: '2026-10-14', comida: 'cena' }],
  })

  it('plan, selección, ausencia y cierre alimentan simultáneamente lista y total', () => {
    for (const comida of TIEMPOS_COMIDA) {
      expect(dia.resumen[comida].asistentes).toHaveLength(totalQueComen(dia.resumen[comida]))
    }
    expect(dia.resumen.almuerzo.asistentes?.map(({ siglas }) => siglas)).toEqual(['AA', 'BB', 'DD'])
    expect(dia.resumen.desayuno.asistentes).toEqual([])
    // El congelado gana sobre la ausencia; sin selección congelada queda sin definir.
    expect(dia.resumen.cena.asistentes?.map(({ siglas }) => siglas)).toEqual(['AA'])
  })

  it('las notas de dieta son independientes de las notas de la comida y nunca viajan nombres ni IDs', () => {
    const [payload] = agregarSemana([dia])
    expect(payload.resumen.almuerzo.asistentes?.[0]).toEqual({
      siglas: 'AA', estado: 'enfermo', nota: 'Indicación puntual', notaDieta: 'Indicación general A',
    })
    expect(JSON.stringify(payload)).not.toMatch(/Nombre secreto|"id"|"nombre"|"usuario_id"/)
    expect(payload.resumen.cena.asistentes?.[0].notaDieta).toBe('Indicación general A')
  })

  it('el plan habitual no hereda selecciones, ausencias ni cierres de una semana', () => {
    const habitual = resumenPlanSemanal(personas.map((persona) => ({
      ...persona, plan: { 3: { almuerzo: { estado: 'si', nota: null } } },
    })))
    expect(habitual[3].almuerzo.asistentes).toHaveLength(4)
    expect(totalQueComen(habitual[3].almuerzo)).toBe(4)
    expect(habitual[3].almuerzo.asistentes?.map(({ estado }) => estado)).toEqual(['si', 'si', 'si', 'si'])
  })

  it('todos los estados que preparan comida cuentan como asistentes, sin no ni sin definir', () => {
    const resumen = resumenConAsistentes([
      ...ESTADOS_COMIDA.map((estado) => ({ siglas: estado, valor: { estado, nota: null, origen: 'plan' as const } })),
      { siglas: 'FALTA', valor: null },
    ])
    expect(resumen.asistentes).toHaveLength(6)
    expect(resumen.asistentes).toHaveLength(totalQueComen(resumen))
    expect(resumen.asistentes?.map(({ estado }) => estado)).not.toContain('no')
  })

  it('la consulta por siglas ofrece notas junto a cada asistente, sin controles de edición', () => {
    const markup = renderToStaticMarkup(createElement(AsistentesAdministracion, { asistentes: dia.resumen.almuerzo.asistentes }))
    expect(markup).toContain('<details class="asistentes-admin">')
    expect(markup).toContain('Quiénes comen (3)')
    expect(markup).toContain('<strong>AA</strong>')
    expect(markup).toContain('Notas de dieta:')
    expect(markup).toContain('Indicación general A')
    expect(markup).toContain('Nota de esta comida: Indicación puntual')
    expect(markup).not.toMatch(/Nombre secreto|<button|<textarea| title=/)
  })
})

describe('nota de dieta opcional', () => {
  it.each([undefined, null, '', '   '])('acepta el campo vacío %s como eliminación', (nota) => {
    expect(esquemaNotaDieta.parse({ nota }).nota).toBeNull()
  })
  it('recorta el texto sin perder saltos de línea interiores', () => {
    expect(esquemaNotaDieta.parse({ nota: '  Primera línea\nSegunda línea  ' }).nota).toBe('Primera línea\nSegunda línea')
  })
  it('admite hasta 1000 caracteres y rechaza valores inválidos', () => {
    expect(esquemaNotaDieta.safeParse({ nota: 'x'.repeat(1000) }).success).toBe(true)
    expect(esquemaNotaDieta.safeParse({ nota: 'x'.repeat(1001) }).success).toBe(false)
    expect(esquemaNotaDieta.safeParse({ nota: 123 }).success).toBe(false)
    expect(esquemaNotaDieta.safeParse({ usuarioId: 'otra', nota: '' }).success).toBe(false)
  })
})
