/*
 * Dónde va la burbuja de una comida y cuánto hay que desplazar la página para verla (DESIGN.md §8).
 * Puro, para probarlo sin navegador; `components/ui/burbuja.tsx` lo usa con las medidas reales.
 *
 * La burbuja va en `position:absolute` sobre la página (no `fixed`): se mueve con lo que se desplaza,
 * el teclado del teléfono no la deja flotando en otro lugar y, si es más alta que la pantalla, se
 * llega a su final desplazando la página como siempre, sin una segunda barra adentro.
 */

export type Lado = 'abajo' | 'arriba'
export type Rect = { top: number; bottom: number; left: number; right: number }
export type Posicion = {
  /** En la página (ya sumado el desplazamiento). */
  top: number
  left: number
  lado: Lado
  /** Dónde apunta la flecha, desde el borde izquierdo de la burbuja. */
  flecha: number
}

/** Margen con los bordes de la pantalla. */
export const MARGEN_BURBUJA = 16
/** Entre el botón y la burbuja: ahí va la flecha. */
export const SEPARACION_BURBUJA = 12
/** La flecha nunca cae sobre la esquina redondeada (--r-lg). */
const FLECHA_MINIMA = 32

function acotar(valor: number, minimo: number, maximo: number): number {
  return Math.max(minimo, Math.min(valor, maximo))
}

/**
 * Debajo del botón y centrada en él; arriba si abajo no entra y arriba sí; si no entra en ningún
 * lado, abajo (arriba quedaría fuera de la página, abajo se llega desplazando). A lo ancho, siempre
 * dentro de la pantalla con su margen. `lado`: el que ya tiene una burbuja abierta; se conserva
 * mientras quepa en la página, así no salta de un lado al otro cuando crece (aparece el campo de la
 * hora) ni cuando el teclado achica la pantalla.
 */
export function calcularPosicion(p: {
  /** El botón que la abrió, en la pantalla. */
  ancla: Rect
  tamano: { ancho: number; alto: number }
  vista: { ancho: number; alto: number }
  desplazamiento?: { x: number; y: number }
  /** Lo que tapa el final de la pantalla (la barra inferior del teléfono). */
  reservaAbajo?: number
  lado?: Lado | null
}): Posicion {
  const { ancla, tamano, vista } = p
  const { x, y } = p.desplazamiento ?? { x: 0, y: 0 }
  const reservaAbajo = p.reservaAbajo ?? 0
  const m = MARGEN_BURBUJA
  const s = SEPARACION_BURBUJA

  const centro = (ancla.left + ancla.right) / 2
  const left = Math.max(m, Math.min(centro - tamano.ancho / 2, vista.ancho - m - tamano.ancho))

  let lado: Lado
  if (p.lado === 'abajo') lado = 'abajo'
  else if (p.lado === 'arriba') lado = ancla.top + y - s - tamano.alto >= m ? 'arriba' : 'abajo'
  else {
    const abajo = vista.alto - reservaAbajo - ancla.bottom - s - m
    const arriba = ancla.top - s - m
    lado = tamano.alto <= abajo || tamano.alto > arriba ? 'abajo' : 'arriba'
  }

  const top = lado === 'abajo' ? ancla.bottom + s : ancla.top - s - tamano.alto
  return {
    top: top + y,
    left: left + x,
    lado,
    flecha: acotar(centro - left, FLECHA_MINIMA, tamano.ancho - FLECHA_MINIMA),
  }
}

/**
 * Cuánto bajar la página para que la burbuja recién abierta se vea entera (0 si ya se ve), sin que
 * el botón que la abrió se vaya por arriba: si la burbuja es más alta que la pantalla, el botón queda
 * arriba y la burbuja empieza debajo de él.
 */
export function cuantoDesplazar(p: { burbuja: Rect; ancla: Rect; vista: { alto: number }; reservaAbajo?: number }): number {
  const limite = p.vista.alto - (p.reservaAbajo ?? 0) - MARGEN_BURBUJA
  const falta = p.burbuja.bottom - limite
  if (falta <= 0) return 0
  return Math.max(0, Math.min(falta, p.ancla.top - MARGEN_BURBUJA))
}

/** Un toque apenas mueve el dedo; arrastrarlo para desplazar la página no cierra la burbuja. */
export function esToque(inicio: { x: number; y: number }, fin: { x: number; y: number }, tolerancia = 10): boolean {
  return Math.hypot(fin.x - inicio.x, fin.y - inicio.y) <= tolerancia
}

/**
 * El siguiente de `ancla` en `orden` que no se excluye (lo que está dentro de la burbuja): adónde va
 * el foco con Tab desde el último control de la burbuja, como si estuviera justo después del botón.
 */
export function siguienteDespues<T>(orden: readonly T[], ancla: T, excluir: (elemento: T) => boolean): T | null {
  const desde = orden.indexOf(ancla)
  if (desde < 0) return null
  return orden.slice(desde + 1).find((elemento) => !excluir(elemento)) ?? null
}
