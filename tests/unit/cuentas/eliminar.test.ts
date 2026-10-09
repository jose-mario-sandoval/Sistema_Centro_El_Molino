import { describe, expect, it } from 'vitest'
import { textoLoQueSeBorra, textoLoQueSeConserva } from '@/lib/cuentas/eliminar'

const resumen = (mensajes: number, respuestasDeOtros = 0, eventos = 0) => ({ mensajes, respuestasDeOtros, eventos })

describe('textoLoQueSeBorra: lo que el Director lee antes de eliminar una cuenta', () => {
  it('sin mensajes, lo dice', () => {
    expect(textoLoQueSeBorra(resumen(0))).toBe(
      'Se borra todo lo suyo: sus comidas, su plan, sus ausencias y sus avisos. No tiene mensajes.',
    )
  })

  it('con mensajes propios, cuántos (en singular y en plural)', () => {
    expect(textoLoQueSeBorra(resumen(1))).toBe('Se borra todo lo suyo: sus comidas, su plan, sus ausencias y su mensaje.')
    expect(textoLoQueSeBorra(resumen(4))).toBe('Se borra todo lo suyo: sus comidas, su plan, sus ausencias y sus 4 mensajes.')
  })

  it('avisa de las respuestas de otras personas que se van con sus publicaciones', () => {
    expect(textoLoQueSeBorra(resumen(3, 1))).toBe(
      'Se borra todo lo suyo: sus comidas, su plan, sus ausencias y sus 3 mensajes, con la respuesta que otra persona escribió en sus publicaciones.',
    )
    expect(textoLoQueSeBorra(resumen(3, 5))).toBe(
      'Se borra todo lo suyo: sus comidas, su plan, sus ausencias y sus 3 mensajes, con las 5 respuestas que otras personas escribieron en sus publicaciones.',
    )
  })
})

describe('textoLoQueSeConserva: los eventos son de la casa', () => {
  it('si no cargó eventos, no hay nada que decir', () => {
    expect(textoLoQueSeConserva(resumen(0, 0, 0))).toBeNull()
  })

  it('uno o varios', () => {
    expect(textoLoQueSeConserva(resumen(0, 0, 1))).toBe('El evento que cargó en el calendario se conserva.')
    expect(textoLoQueSeConserva(resumen(0, 0, 7))).toBe('Los 7 eventos que cargó en el calendario se conservan.')
  })
})
