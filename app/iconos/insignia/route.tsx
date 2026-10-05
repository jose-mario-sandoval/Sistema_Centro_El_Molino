import { ImageResponse } from 'next/og'

/*
 * Insignia de las notificaciones (`badge` en public/sw.js): Android la pinta en la barra de estado
 * como silueta, usando solo el canal alfa. Por eso es blanca sobre transparente: el escudo de El
 * Molino con la torre calada y su puerta. Se genera acá, sin depender de los íconos a color
 * (components/app/monograma.tsx).
 *
 * Un solo trazado con relleno evenodd: el escudo (lleno), la torre (hueco) y la puerta (llena).
 */
const ESCUDO_CON_TORRE = [
  // Escudo
  'M18 8H78Q82 8 82 12V46C82 68 66 81 48 89C30 81 14 68 14 46V12Q14 8 18 8Z',
  // Torre con almenas
  'M35 20H40V25H45.5V20H50.5V25H56V20H61V72H35Z',
  // Puerta en arco
  'M43 72V61A5 5 0 0 1 53 61V72Z',
].join('')

const LADO = 96

export function GET() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex' }}>
        <svg width={LADO} height={LADO} viewBox={`0 0 ${LADO} ${LADO}`}>
          <path d={ESCUDO_CON_TORRE} fill="#FFFFFF" fillRule="evenodd" />
        </svg>
      </div>
    ),
    { width: LADO, height: LADO, headers: { 'Cache-Control': 'public, max-age=604800' } },
  )
}
