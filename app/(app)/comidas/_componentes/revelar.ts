/** Hasta dónde se ve de verdad: la barra inferior del teléfono tapa el final (su alto va en `scroll-margin-bottom`). */
function bordeInferiorVisible(elemento: HTMLElement): number {
  return window.innerHeight - (parseFloat(getComputedStyle(elemento).scrollMarginBottom) || 0)
}

function subir(ancla: HTMLElement, suave: boolean) {
  const quieto = !suave || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ancla.scrollIntoView({ block: 'start', behavior: quieto ? 'auto' : 'smooth' })
}

/** Cuánto del panel tiene que verse al entrar para no mover la página: su título y el comienzo de la primera comida. */
const PANEL_A_LA_VISTA = 160

/**
 * Un panel recién abierto debajo de una fila tiene que quedar a la vista (La casa: quiénes comen).
 * Si ya se ve entero no se mueve nada; si no, sube la fila hasta arriba, así se sigue viendo qué día
 * es y el panel queda justo debajo. Si la fila es más alta que la pantalla (el teléfono o letra
 * grande: la fila de un día apilada son tres fichas), sube el panel: lo que se abrió tiene que verse.
 */
export function revelarDebajoDeFila(panel: HTMLElement | null, fila: HTMLElement | null) {
  if (!panel || !fila) return
  const { top, bottom } = panel.getBoundingClientRect()
  const limite = bordeInferiorVisible(panel)
  if (top >= 0 && bottom <= limite) return
  const cabe = fila.getBoundingClientRect().height + PANEL_A_LA_VISTA <= limite
  subir(cabe ? fila : panel, true)
}

/**
 * Al entrar a la semana en curso, la tarjeta de hoy tiene que verse (DESIGN.md §8: lo primero que se
 * ofrece es algo que todavía se puede cambiar). Un jueves en el teléfono queda debajo del borde. Si
 * no se ve entera, sube hasta arriba, sin animación: es donde empieza la página, no un movimiento.
 */
export function revelarAlEntrar(tarjeta: HTMLElement | null) {
  if (!tarjeta) return
  const { top, bottom } = tarjeta.getBoundingClientRect()
  if (top >= 0 && bottom <= bordeInferiorVisible(tarjeta)) return
  subir(tarjeta, false)
}
