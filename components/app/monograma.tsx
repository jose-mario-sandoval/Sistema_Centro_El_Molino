import { ESCUDO_ALTO, ESCUDO_ANCHO, ESCUDO_DATOS } from './marca/escudo-datos'

/**
 * El escudo de El Molino sobre el fondo crema de la app, para los íconos generados con ImageResponse
 * (pantalla de inicio del teléfono, pestaña de Apple). `conMargen` deja la zona segura de los íconos
 * maskable: Android los recorta en círculo o en gota, y solo el 80% central queda siempre a la vista.
 */
export function Monograma({ lado, conMargen }: { lado: number; conMargen: boolean }) {
  const alto = Math.round(lado * (conMargen ? 0.56 : 0.78))
  const ancho = Math.round((alto * ESCUDO_ANCHO) / ESCUDO_ALTO)
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F1EDE3',
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse solo entiende <img> */}
      <img src={ESCUDO_DATOS} width={ancho} height={alto} alt="" />
    </div>
  )
}
