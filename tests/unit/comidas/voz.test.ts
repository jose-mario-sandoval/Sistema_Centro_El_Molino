import { describe, expect, it } from 'vitest'
import {
  avisoAusenciaMarcada,
  avisoAusenciaQuitada,
  CAMBIADA_POR_EL_DIRECTOR,
  etiquetaNota,
  etiquetaOpciones,
  MARCADA_POR_EL_DIRECTOR,
  preguntaComida,
  preguntaPlan,
  textoOrigen,
  textosAusencias,
  textoVolver,
} from '@/lib/comidas/voz'

/*
 * Voz propia: la persona mira sus comidas ("¿Vas a almorzar…?"). Voz ajena: el Director mira las de
 * otra persona ("¿Va a almorzar…?"). Voseo salvadoreño en las dos.
 */

describe('preguntaComida', () => {
  it.each([
    ['desayuno', 'Lunes', 'propia', '¿Vas a desayunar el lunes?'],
    ['almuerzo', 'Miércoles', 'propia', '¿Vas a almorzar el miércoles?'],
    ['cena', 'Domingo', 'propia', '¿Vas a cenar el domingo?'],
    ['almuerzo', 'Miércoles', 'ajena', '¿Va a almorzar el miércoles?'],
    ['cena', 'Sábado', 'ajena', '¿Va a cenar el sábado?'],
  ] as const)('%s del %s, voz %s → %s', (comida, dia, voz, esperado) => {
    expect(preguntaComida(comida, dia, voz)).toBe(esperado)
  })
})

describe('textoOrigen: de dónde sale el valor', () => {
  it('según el plan', () => {
    expect(textoOrigen({ estado: 'si', nota: null, origen: 'plan' }, 'propia')).toBe('según tu plan')
    expect(textoOrigen({ estado: 'si', nota: null, origen: 'plan' }, 'ajena')).toBe('según su plan')
  })

  it('por la ausencia', () => {
    expect(textoOrigen({ estado: 'no', nota: null, origen: 'ausencia' }, 'propia')).toBe('por tu ausencia')
    expect(textoOrigen({ estado: 'no', nota: null, origen: 'ausencia' }, 'ajena')).toBe('por su ausencia')
  })

  it('cambiada por la persona', () => {
    expect(textoOrigen({ estado: 'bolsa', nota: null, origen: 'persona' }, 'propia')).toBe('cambiada')
    expect(textoOrigen({ estado: 'bolsa', nota: null, origen: 'persona' }, 'ajena')).toBe('cambiada')
  })

  it('cambiada por el Director: la persona lo ve, y el Director también', () => {
    const valor = { estado: 'no', nota: null, origen: 'persona', cambiadaPorOtro: true } as const
    expect(textoOrigen(valor, 'propia')).toBe('la cambió el Director')
    expect(textoOrigen(valor, 'ajena')).toBe('la cambió el Director')
    expect(CAMBIADA_POR_EL_DIRECTOR).toBe('la cambió el Director')
  })
})

describe('textoVolver: el botón que borra la excepción', () => {
  it.each([
    [false, 'propia', 'Volver a mi plan'],
    [true, 'propia', 'Volver a mi ausencia'],
    [false, 'ajena', 'Volver a su plan'],
    [true, 'ajena', 'Volver a su ausencia'],
  ] as const)('ausente %s, voz %s → %s', (ausente, voz, esperado) => {
    expect(textoVolver(ausente, voz)).toBe(esperado)
  })
})

describe('etiquetaNota', () => {
  it('la hora es igual en las dos voces; la nota de enfermo no', () => {
    expect(etiquetaNota('hora', 'propia')).toBe('Hora')
    expect(etiquetaNota('hora', 'ajena')).toBe('Hora')
    expect(etiquetaNota('texto', 'propia')).toBe('Qué podés comer')
    expect(etiquetaNota('texto', 'ajena')).toBe('Qué puede comer')
  })
})

describe('etiquetaOpciones: el grupo de las seis opciones', () => {
  it('propia: "Elegí qué hacés con el almuerzo"', () => {
    expect(etiquetaOpciones('el almuerzo', 'propia')).toBe('Elegí qué hacés con el almuerzo')
  })

  it('ajena, con el nombre: "Elegí qué hace Juan Pérez con el almuerzo"', () => {
    expect(etiquetaOpciones('el almuerzo', 'ajena', 'Juan Pérez')).toBe('Elegí qué hace Juan Pérez con el almuerzo')
    expect(etiquetaOpciones('la cena de los martes', 'ajena')).toBe('Elegí qué hace con la cena de los martes')
  })
})

describe('preguntaPlan: la pregunta del panel de una celda del plan', () => {
  it.each([
    ['almuerzo', 'propia', '¿Normalmente almorzás los martes?'],
    ['desayuno', 'propia', '¿Normalmente desayunás los martes?'],
    ['cena', 'propia', '¿Normalmente cenás los martes?'],
    ['almuerzo', 'ajena', '¿Normalmente almuerza los martes?'],
    ['desayuno', 'ajena', '¿Normalmente desayuna los martes?'],
    ['cena', 'ajena', '¿Normalmente cena los martes?'],
  ] as const)('%s, voz %s → %s', (comida, voz, esperado) => {
    expect(preguntaPlan(comida, 'martes', voz)).toBe(esperado)
  })
})

describe('textos del panel de ausencias', () => {
  it('propia', () => {
    expect(textosAusencias('propia')).toEqual({
      titulo: 'Mis ausencias',
      ayuda: 'Tus comidas de esos días se cancelan solas. Solo vos y el Director ven estas fechas.',
      vacio: 'No tenés ausencias marcadas.',
      comoMarcar:
        'Tocá el primer día y el último día que no vas a estar; si es uno solo, tocalo una vez. Si volvés antes, podés pedir tu comida desde Comidas.',
    })
  })

  it('ajena, con el nombre', () => {
    expect(textosAusencias('ajena', 'Juan Pérez')).toEqual({
      titulo: 'Ausencias de Juan Pérez',
      ayuda: 'Sus comidas de esos días se cancelan solas. Solo la persona y el Director ven estas fechas.',
      vacio: 'No tiene ausencias marcadas.',
      comoMarcar:
        'Tocá el primer día y el último día que no va a estar; si es uno solo, tocalo una vez. Si vuelve antes, se le puede pedir la comida desde su semana.',
    })
  })
})

describe('ausencias', () => {
  it('la marca de quien la marcó', () => {
    expect(MARCADA_POR_EL_DIRECTOR).toBe('La marcó el Director')
  })

  it('avisos al marcar y al quitar', () => {
    expect(avisoAusenciaMarcada('propia')).toBe('Ausencia marcada. Tus comidas de esos días quedan canceladas.')
    expect(avisoAusenciaMarcada('ajena')).toBe('Ausencia marcada. Sus comidas de esos días quedan canceladas.')
    expect(avisoAusenciaQuitada('propia')).toBe('Ausencia quitada. Tus comidas vuelven a tu plan.')
    expect(avisoAusenciaQuitada('ajena')).toBe('Ausencia quitada. Sus comidas vuelven a su plan.')
  })
})
