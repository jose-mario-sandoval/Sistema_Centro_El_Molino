import { fallo, type Resultado } from '@/lib/acciones/resultado'

export const ERROR_CONEXION = 'No se pudo conectar. Revisá tu conexión o recargá la página.'

/**
 * Para llamar Server Actions desde el cliente. La promesa de una acción se rechaza sin llegar al servidor
 * (sin red, o "Failed to find Server Action" después de un despliegue); sin esto el error sube hasta
 * error.tsx y se pierde la sección entera. Los errores esperables ya vuelven como `fallo` desde la acción.
 */
export async function llamarAccion<T>(accion: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await accion()
  } catch (error) {
    console.error(error)
    return fallo(ERROR_CONEXION)
  }
}
