'use client'

import { cerrarSesion } from './acciones-sesion'

/** La pista 06 agrega aquí la baja de la suscripción push antes de salir. */
export function BotonCerrarSesion() {
  return (
    <form action={cerrarSesion}>
      <button type="submit" className="link-btn">
        Cerrar sesión
      </button>
    </form>
  )
}
