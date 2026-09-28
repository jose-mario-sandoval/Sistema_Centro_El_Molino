/** Hasta dónde se ve de verdad: la barra inferior del teléfono tapa el final (su alto va en `scroll-margin-bottom`). */
function bordeInferiorVisible(panel: HTMLElement): number {
  return window.innerHeight - (parseFloat(getComputedStyle(panel).scrollMarginBottom) || 0)
}

function subir(ancla: HTMLElement, suave: boolean) {
  const quieto = !suave || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ancla.scrollIntoView({ block: 'start', behavior: quieto ? 'auto' : 'smooth' })
}

/**
 * Un panel recién abierto tiene que quedar a la vista: tocar el domingo en un teléfono no puede
 * abrir algo debajo del borde de la pantalla. Si el panel ya se ve entero no se mueve nada; si no,
 * sube `ancla` (la fila o la tarjeta que se tocó) hasta arriba, así se sigue viendo qué día es y el
 * panel queda justo debajo. Sin animación si la persona pidió menos movimiento. El margen de arriba
 * (cabecera fija) lo pone `scroll-margin-top` en CSS.
 */
export function revelar(panel: HTMLElement | null, ancla: HTMLElement | null) {
  if (!panel || !ancla) return
  const { top, bottom } = panel.getBoundingClientRect()
  if (top >= 0 && bottom <= bordeInferiorVisible(panel)) return
  subir(ancla, true)
}

/** Cuánto del panel tiene que verse al entrar para no mover la página: su título y el comienzo de la primera comida. */
const PANEL_A_LA_VISTA = 160

/**
 * Al entrar a la semana en curso, el día que se abrió solo tiene que verse (DESIGN.md §8: lo primero
 * que se ofrece es algo que todavía se puede cambiar). Un jueves en el teléfono su tarjeta queda
 * debajo del borde. Si la tarjeta no se ve entera, o del panel no se ve ni el comienzo, sube la
 * tarjeta hasta arriba, sin animación: es donde empieza la página, no un movimiento.
 */
export function revelarAlEntrar(panel: HTMLElement | null, ancla: HTMLElement | null) {
  if (!panel || !ancla) return
  const tarjeta = ancla.getBoundingClientRect()
  const limite = bordeInferiorVisible(panel)
  const tarjetaEntera = tarjeta.top >= 0 && tarjeta.bottom <= limite
  const comienzoDelPanel = panel.getBoundingClientRect().top + PANEL_A_LA_VISTA <= limite
  if (tarjetaEntera && comienzoDelPanel) return
  subir(ancla, false)
}
