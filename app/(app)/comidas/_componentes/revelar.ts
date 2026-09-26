/**
 * Un panel recién abierto tiene que quedar a la vista: tocar el domingo en un teléfono no puede
 * abrir algo debajo del borde de la pantalla. Si el panel ya se ve entero no se mueve nada; si no,
 * sube `ancla` (la fila o la tarjeta que se tocó) hasta arriba, así se sigue viendo qué día es y el
 * panel queda justo debajo. Sin animación si la persona pidió menos movimiento. Los márgenes
 * (cabecera fija arriba, barra inferior abajo) los pone `scroll-margin` en CSS.
 */
export function revelar(panel: HTMLElement | null, ancla: HTMLElement | null) {
  if (!panel || !ancla) return
  const { top, bottom } = panel.getBoundingClientRect()
  const tapadoAbajo = parseFloat(getComputedStyle(panel).scrollMarginBottom) || 0
  if (top >= 0 && bottom <= window.innerHeight - tapadoAbajo) return
  const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  ancla.scrollIntoView({ block: 'start', behavior: quieto ? 'auto' : 'smooth' })
}
