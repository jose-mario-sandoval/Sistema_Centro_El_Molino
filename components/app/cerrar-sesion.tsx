'use client'

import { BotonEnvio } from '@/components/ui/boton-envio'
import { darDeBajaAlCerrarSesion } from '@/lib/push/cliente'
import { cerrarSesion } from './acciones-sesion'

/** Antes de salir, da de baja las notificaciones de este dispositivo (spec §8.2). Si falla, sale igual. */
export function BotonCerrarSesion() {
  async function salir() {
    // Primero la baja, mientras la sesión todavía existe (DELETE /api/push la exige).
    try {
      await darDeBajaAlCerrarSesion()
    } catch (error) {
      console.error('[push] no se pudo dar de baja este dispositivo al cerrar sesión', error)
    }
    // Sin llamarAccion: el redirect() de cerrarSesion llega al cliente como rechazo de esta promesa
    // y lo resuelve Next navegando a /login; atraparlo impediría salir.
    await cerrarSesion()
  }

  return (
    <form action={salir}>
      <BotonEnvio className="link-btn" textoPendiente="Saliendo…">
        Cerrar sesión
      </BotonEnvio>
    </form>
  )
}
