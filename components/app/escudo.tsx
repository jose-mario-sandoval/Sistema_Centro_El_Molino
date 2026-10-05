import Image from 'next/image'
import escudo from './marca/escudo.png'

/**
 * El escudo de El Molino (logo del Centro Cultural). Decorativo: siempre va junto al nombre escrito,
 * que es texto real para que siga el tema claro u oscuro (el texto del logo original es azul oscuro y
 * en modo oscuro no se leería). El alto lo pone el CSS de cada lugar; el ancho sigue la proporción.
 */
export function Escudo({ className }: { className?: string }) {
  return (
    <Image
      src={escudo}
      alt=""
      aria-hidden="true"
      className={className ? `escudo ${className}` : 'escudo'}
      unoptimized
      loading="eager"
    />
  )
}
