import { describe, expect, it } from 'vitest'
import { calcularPosicion, cuantoDesplazar, esToque, siguienteDespues } from '@/lib/burbuja'

/*
 * La burbuja de una comida: dónde va (debajo del botón que se tocó, arriba si abajo no entra,
 * siempre dentro de la pantalla con 16px de margen) y cuánto hay que desplazar la página para que
 * se vea. Coordenadas del botón y de la burbuja en la pantalla (getBoundingClientRect); el
 * resultado, en la página (position:absolute), así la burbuja se mueve con lo que se desplaza.
 */

const VISTA = { ancho: 375, alto: 812 }

function rect(top: number, left: number, alto: number, ancho: number) {
  return { top, left, bottom: top + alto, right: left + ancho }
}

describe('calcularPosicion', () => {
  it('debajo del botón y centrada en él cuando entra', () => {
    const p = calcularPosicion({ ancla: rect(100, 100, 56, 100), tamano: { ancho: 200, alto: 300 }, vista: VISTA })
    expect(p.lado).toBe('abajo')
    expect(p.top).toBe(156 + 12)
    expect(p.left).toBe(150 - 100)
    // La flecha apunta al centro del botón.
    expect(p.flecha).toBe(100)
  })

  it('suma el desplazamiento de la página: queda pegada al botón aunque la página se mueva', () => {
    const p = calcularPosicion({
      ancla: rect(100, 100, 56, 100),
      tamano: { ancho: 200, alto: 300 },
      vista: VISTA,
      desplazamiento: { x: 0, y: 900 },
    })
    expect(p.top).toBe(900 + 156 + 12)
  })

  it('no se sale por la izquierda ni por la derecha: 16px de margen', () => {
    const izquierda = calcularPosicion({ ancla: rect(100, 0, 56, 40), tamano: { ancho: 300, alto: 200 }, vista: VISTA })
    expect(izquierda.left).toBe(16)
    const derecha = calcularPosicion({ ancla: rect(100, 335, 56, 40), tamano: { ancho: 300, alto: 200 }, vista: VISTA })
    expect(derecha.left).toBe(375 - 16 - 300)
  })

  it('en un teléfono angosto ocupa todo el ancho menos los márgenes', () => {
    const p = calcularPosicion({ ancla: rect(100, 200, 56, 90), tamano: { ancho: 288, alto: 200 }, vista: { ancho: 320, alto: 640 } })
    expect(p.left).toBe(16)
  })

  it('la flecha no cae sobre la esquina redondeada', () => {
    const p = calcularPosicion({ ancla: rect(100, 0, 56, 20), tamano: { ancho: 300, alto: 200 }, vista: VISTA })
    expect(p.flecha).toBe(32)
    const q = calcularPosicion({ ancla: rect(100, 355, 56, 20), tamano: { ancho: 300, alto: 200 }, vista: VISTA })
    expect(q.flecha).toBe(300 - 32)
  })

  it('arriba si abajo no entra y arriba sí', () => {
    const p = calcularPosicion({ ancla: rect(600, 100, 56, 100), tamano: { ancho: 200, alto: 300 }, vista: VISTA })
    expect(p.lado).toBe('arriba')
    expect(p.top).toBe(600 - 12 - 300)
  })

  it('la barra inferior del teléfono no cuenta como lugar libre', () => {
    // Abajo quedan 812 - 456 - 12 - 16 = 328px: entra una burbuja de 300px... salvo que la barra tape 90.
    const sinBarra = calcularPosicion({ ancla: rect(400, 100, 56, 100), tamano: { ancho: 200, alto: 300 }, vista: VISTA })
    expect(sinBarra.lado).toBe('abajo')
    const conBarra = calcularPosicion({
      ancla: rect(400, 100, 56, 100),
      tamano: { ancho: 200, alto: 300 },
      vista: VISTA,
      reservaAbajo: 90,
    })
    expect(conBarra.lado).toBe('arriba')
  })

  it('si no entra ni arriba ni abajo, va abajo: arriba quedaría fuera de la página, abajo se llega desplazando', () => {
    const p = calcularPosicion({ ancla: rect(300, 100, 56, 100), tamano: { ancho: 200, alto: 700 }, vista: VISTA })
    expect(p.lado).toBe('abajo')
    expect(p.top).toBe(356 + 12)
  })

  it('una vez abierta no cambia de lado al crecer (aparece el campo de la hora), mientras quepa en la página', () => {
    const p = calcularPosicion({
      ancla: rect(600, 100, 56, 100),
      tamano: { ancho: 200, alto: 500 },
      vista: VISTA,
      desplazamiento: { x: 0, y: 400 },
      lado: 'arriba',
    })
    expect(p.lado).toBe('arriba')
    expect(p.top).toBe(400 + 600 - 12 - 500)
    const abajo = calcularPosicion({ ancla: rect(100, 100, 56, 100), tamano: { ancho: 200, alto: 900 }, vista: VISTA, lado: 'abajo' })
    expect(abajo.lado).toBe('abajo')
  })

  it('arriba pasa abajo si ya no entra ni en la página', () => {
    const p = calcularPosicion({ ancla: rect(200, 100, 56, 100), tamano: { ancho: 200, alto: 500 }, vista: VISTA, lado: 'arriba' })
    expect(p.lado).toBe('abajo')
  })
})

describe('cuantoDesplazar: lo que se abrió tiene que verse', () => {
  it('nada si la burbuja ya se ve entera', () => {
    expect(cuantoDesplazar({ burbuja: rect(200, 16, 300, 343), ancla: rect(130, 16, 56, 100), vista: VISTA })).toBe(0)
  })

  it('baja lo justo para que se vea el final, con margen', () => {
    // Termina en 900: faltan 900 - (812 - 16) = 104px.
    expect(cuantoDesplazar({ burbuja: rect(500, 16, 400, 343), ancla: rect(430, 16, 56, 100), vista: VISTA })).toBe(104)
  })

  it('cuenta la barra inferior del teléfono', () => {
    expect(
      cuantoDesplazar({ burbuja: rect(500, 16, 250, 343), ancla: rect(430, 16, 56, 100), vista: VISTA, reservaAbajo: 90 }),
    ).toBe(750 - (812 - 90 - 16))
  })

  it('si es más alta que la pantalla, el botón queda arriba y la burbuja empieza debajo', () => {
    expect(cuantoDesplazar({ burbuja: rect(500, 16, 1200, 343), ancla: rect(430, 16, 56, 100), vista: VISTA })).toBe(430 - 16)
  })
})

describe('esToque: distinguir un toque de un desplazamiento', () => {
  it('un toque apenas se mueve', () => {
    expect(esToque({ x: 10, y: 10 }, { x: 14, y: 13 })).toBe(true)
  })
  it('arrastrar el dedo para desplazar no es un toque', () => {
    expect(esToque({ x: 10, y: 10 }, { x: 10, y: 40 })).toBe(false)
  })
})

describe('siguienteDespues: adónde va el foco al salir de la burbuja con Tab', () => {
  const orden = ['a', 'ancla', 'b1', 'b2', 'c']
  it('al siguiente del botón que la abrió, saltando lo que está dentro de la burbuja', () => {
    expect(siguienteDespues(orden, 'ancla', (x) => x.startsWith('b'))).toBe('c')
  })
  it('null si no hay nada después', () => {
    expect(siguienteDespues(orden, 'c', () => false)).toBeNull()
    expect(siguienteDespues(orden, 'zzz', () => false)).toBeNull()
  })
})
