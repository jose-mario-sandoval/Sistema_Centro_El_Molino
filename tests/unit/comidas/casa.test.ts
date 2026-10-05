import { describe, expect, it } from 'vitest'
import {
  ajustarCantidad,
  descripcionComidas,
  diasParaExtra,
  etiquetaAgregarExtra,
  etiquetaCeldaCasa,
  etiquetaGrupo,
  extrasDeComida,
  extraSinGuardar,
  notasPorComida,
  pestanasComidas,
  pestanasPersona,
  textoCantidadExtra,
  textoExtra,
  tituloComidaDePersona,
  tituloExtras,
} from '@/lib/comidas/casa'
import { resumenComida } from '@/lib/comidas/resumen'

describe('pestanasComidas: "La casa" solo para el Director', () => {
  it('el Director ve Plan, Semana y La casa', () => {
    expect(pestanasComidas(true).map((p) => [p.ruta, p.etiqueta])).toEqual([
      ['/comidas/plan', 'Plan de comida'],
      ['/comidas/semana', 'Semana'],
      ['/comidas/casa', 'La casa'],
    ])
  })

  it('los demás, solo Plan y Semana', () => {
    expect(pestanasComidas(false).map((p) => p.ruta)).toEqual(['/comidas/plan', '/comidas/semana'])
  })
})

describe('descripcionComidas: el texto bajo "Comidas" según quién mira y dónde', () => {
  it('Director o Residente en su Plan o su Semana: lo suyo', () => {
    for (const rol of ['director', 'residente'] as const) {
      expect(descripcionComidas(rol, '/comidas/semana')).toBe('Tu plan habitual y lo que vas a comer cada día de la semana.')
    }
  })

  it('el Director en La casa (y en la página de una persona): la casa entera', () => {
    const texto = 'Las comidas de toda la casa: quién come cada día, la comida de cada persona y los extras para la cocina.'
    expect(descripcionComidas('director', '/comidas/casa')).toBe(texto)
    expect(descripcionComidas('director', '/comidas/casa/0b8f7c4e-1a2b-4c3d-8e9f-0a1b2c3d4e5f')).toBe(texto)
  })

  it('Administración: solo lectura', () => {
    expect(descripcionComidas('administracion', '/comidas/semana')).toBe('Planes y selecciones de comida de la casa, en solo lectura.')
  })
})

describe('pestanasPersona: las vistas de una persona en La casa', () => {
  it('de otra persona: "Su semana", "Su plan", "Sus ausencias"', () => {
    expect(pestanasPersona('ajena').map((p) => [p.clave, p.etiqueta])).toEqual([
      ['semana', 'Su semana'],
      ['plan', 'Su plan'],
      ['ausencias', 'Sus ausencias'],
    ])
  })

  it('el Director mirándose a sí mismo: "Mi semana", "Mi plan", "Mis ausencias"', () => {
    expect(pestanasPersona('propia').map((p) => p.etiqueta)).toEqual(['Mi semana', 'Mi plan', 'Mis ausencias'])
  })
})

describe('tituloComidaDePersona: el título de la burbuja de una persona en "quiénes comen"', () => {
  it('de otra persona: su nombre, la comida y el día', () => {
    expect(tituloComidaDePersona('almuerzo', 'Miércoles', '23/9', 'Juan Pérez')).toBe('Almuerzo de Juan Pérez, miércoles 23/9')
  })

  it('el Director mirándose a sí mismo: "Tu …"', () => {
    expect(tituloComidaDePersona('almuerzo', 'Miércoles', '23/9', null)).toBe('Tu almuerzo del miércoles 23/9')
    expect(tituloComidaDePersona('cena', 'Viernes', '25/9', null)).toBe('Tu cena del viernes 25/9')
  })
})

describe('etiquetaCeldaCasa: nombre accesible del botón de una celda', () => {
  const resumen = resumenComida([
    { estado: 'si', nota: null, origen: 'plan' },
    { estado: 'temprano', nota: '07:30', origen: 'persona' },
    null,
  ])

  it('dice qué comida es, cuántos comen, cómo y qué hace tocarla', () => {
    expect(etiquetaCeldaCasa('almuerzo', 'Miércoles', '23/9', resumen)).toBe(
      'Almuerzo del miércoles 23/9: 2 comen. 1 temprano (07:30), 1 sí, 1 sin definir. Ver quiénes',
    )
  })

  it('con extras, los suma escritos', () => {
    expect(etiquetaCeldaCasa('cena', 'Viernes', '25/9', resumen, 3)).toBe(
      'Cena del viernes 25/9: 2 comen. 1 temprano (07:30), 1 sí, 1 sin definir. +3 extra. Ver quiénes',
    )
  })

  it('si ya cerró, lo dice (se toca igual, para ver quiénes comieron)', () => {
    expect(etiquetaCeldaCasa('almuerzo', 'Lunes', '21/9', resumen, 2, true)).toBe(
      'Almuerzo del lunes 21/9: 2 comen. 1 temprano (07:30), 1 sí, 1 sin definir. +2 extra. Cerrada. Ver quiénes',
    )
  })

  it('con las notas de los extras que se ven en la celda', () => {
    expect(etiquetaCeldaCasa('cena', 'Viernes', '25/9', resumen, 3, false, ['3 extra: Sin sal'])).toBe(
      'Cena del viernes 25/9: 2 comen. 1 temprano (07:30), 1 sí, 1 sin definir. +3 extra. 3 extra: Sin sal. Ver quiénes',
    )
  })

  it('lo que puede comer quien está enfermo también se dice: es parte de lo que se ve en la celda', () => {
    const conEnfermo = resumenComida([
      { estado: 'si', nota: null, origen: 'plan' },
      { estado: 'enfermo', nota: 'Sopa de pollo', origen: 'persona' },
    ])
    expect(etiquetaCeldaCasa('cena', 'Viernes', '25/9', conEnfermo)).toBe(
      'Cena del viernes 25/9: 2 comen. 1 enfermo (Sopa de pollo), 1 sí. Ver quiénes',
    )
  })

  it('una sola persona: "come"; sin personas, lo dice', () => {
    expect(etiquetaCeldaCasa('cena', 'Viernes', '25/9', resumenComida([{ estado: 'si', nota: null, origen: 'plan' }]))).toBe(
      'Cena del viernes 25/9: 1 come. 1 sí. Ver quiénes',
    )
    expect(etiquetaCeldaCasa('cena', 'Viernes', '25/9', resumenComida([]))).toBe('Cena del viernes 25/9: 0 comen. Ver quiénes')
  })
})

describe('etiquetaGrupo', () => {
  it('"Sin definir (2)"', () => {
    expect(etiquetaGrupo('Sin definir', 2)).toBe('Sin definir (2)')
    expect(etiquetaGrupo('Comer temprano', 1)).toBe('Comer temprano (1)')
  })
})

describe('diasParaExtra: los días de la semana en que todavía se puede agregar un extra', () => {
  it('semana en curso: de hoy al domingo', () => {
    expect(diasParaExtra('2026-09-21', '2026-09-24')).toEqual(['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'])
  })

  it('semana que viene: los siete', () => {
    expect(diasParaExtra('2026-09-28', '2026-09-24')).toHaveLength(7)
  })

  it('semana pasada: ninguno', () => {
    expect(diasParaExtra('2026-09-14', '2026-09-24')).toEqual([])
  })
})

describe('textoExtra', () => {
  it('"Miércoles 23/9 · Cena · 3 personas"', () => {
    expect(textoExtra({ id: 'x', fecha: '2026-09-23', comida: 'cena', cantidad: 3, nota: null })).toBe(
      'Miércoles 23/9 · Cena · 3 personas',
    )
    expect(textoExtra({ id: 'x', fecha: '2026-09-23', comida: 'desayuno', cantidad: 1, nota: 'x' })).toBe(
      'Miércoles 23/9 · Desayuno · 1 persona',
    )
  })
})

describe('textoCantidadExtra', () => {
  it('"1 persona" · "3 personas"', () => {
    expect(textoCantidadExtra(1)).toBe('1 persona')
    expect(textoCantidadExtra(3)).toBe('3 personas')
  })
})

describe('el "+ Extra" de cada comida en La casa', () => {
  it('etiquetaAgregarExtra: el nombre accesible del botón dice a qué comida agrega', () => {
    expect(etiquetaAgregarExtra('almuerzo', 'Miércoles', '30/9')).toBe('Agregar extra al almuerzo del miércoles 30/9')
    expect(etiquetaAgregarExtra('desayuno', 'Lunes', '28/9')).toBe('Agregar extra al desayuno del lunes 28/9')
    expect(etiquetaAgregarExtra('cena', 'Viernes', '2/10')).toBe('Agregar extra a la cena del viernes 2/10')
  })

  it('tituloExtras: el título de su burbuja', () => {
    expect(tituloExtras('almuerzo', 'Miércoles', '30/9')).toBe('Extras para el almuerzo del miércoles 30/9')
    expect(tituloExtras('cena', 'Viernes', '2/10')).toBe('Extras para la cena del viernes 2/10')
  })

  it('extrasDeComida: solo los de ese día y esa comida', () => {
    const extras = [
      { id: 'a', fecha: '2026-09-30', comida: 'almuerzo' as const, cantidad: 2, nota: null },
      { id: 'b', fecha: '2026-09-30', comida: 'cena' as const, cantidad: 1, nota: 'Sin sal' },
      { id: 'c', fecha: '2026-10-01', comida: 'almuerzo' as const, cantidad: 4, nota: null },
      { id: 'd', fecha: '2026-09-30', comida: 'almuerzo' as const, cantidad: 1, nota: 'Llega tarde' },
    ]
    expect(extrasDeComida(extras, '2026-09-30', 'almuerzo').map((e) => e.id)).toEqual(['a', 'd'])
    expect(extrasDeComida(extras, '2026-10-02', 'almuerzo')).toEqual([])
  })

  it('extraSinGuardar: hay algo escrito que no se agregó (nunca se pierde en silencio)', () => {
    expect(extraSinGuardar({ cantidad: '1', nota: '' })).toBe(false)
    expect(extraSinGuardar({ cantidad: '1', nota: '   ' })).toBe(false)
    expect(extraSinGuardar({ cantidad: '3', nota: '' })).toBe(true)
    expect(extraSinGuardar({ cantidad: '1', nota: 'Sin sal' })).toBe(true)
    expect(extraSinGuardar({ cantidad: '', nota: '' })).toBe(true)
  })
})

describe('ajustarCantidad: los botones − y + del extra', () => {
  it('suma y resta de a uno', () => {
    expect(ajustarCantidad(3, 1)).toBe(4)
    expect(ajustarCantidad(3, -1)).toBe(2)
  })

  it('no baja de 1 ni pasa de 50 (lo mismo que la base)', () => {
    expect(ajustarCantidad(1, -1)).toBe(1)
    expect(ajustarCantidad(50, 1)).toBe(50)
  })

  it('desde un campo vacío o inválido, empieza de 1', () => {
    expect(ajustarCantidad(Number.NaN, 1)).toBe(2)
    expect(ajustarCantidad(Number.NaN, -1)).toBe(1)
  })
})

describe('notasPorComida: las notas de los extras para la celda de la cocina, sin nombres', () => {
  it('agrupa por día y comida, con la cantidad de cada extra; los extras sin nota no suman líneas', () => {
    expect(
      notasPorComida([
        { id: 'a', fecha: '2026-09-23', comida: 'cena', cantidad: 2, nota: 'Sin sal' },
        { id: 'b', fecha: '2026-09-23', comida: 'cena', cantidad: 1, nota: 'Vegetariano' },
        { id: 'c', fecha: '2026-09-23', comida: 'cena', cantidad: 4, nota: null },
        { id: 'd', fecha: '2026-09-24', comida: 'almuerzo', cantidad: 1, nota: 'Llega a las 13:30' },
      ]),
    ).toEqual({
      '2026-09-23': { cena: ['2 extra: Sin sal', '1 extra: Vegetariano'] },
      '2026-09-24': { almuerzo: ['1 extra: Llega a las 13:30'] },
    })
  })

  it('sin extras, vacío', () => {
    expect(notasPorComida([])).toEqual({})
  })
})
