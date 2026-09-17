import { fallo, type Resultado } from '@/lib/acciones/resultado'

export const MENSAJE_SIN_CONEXION = 'No se pudo conectar. Revisá tu conexión o recargá la página.'

/**
 * Llama una Server Action sin dejar que un rechazo de la promesa (sin red, o "Failed to find Server Action"
 * después de un despliegue) llegue al error boundary: lo convierte en un fallo que se muestra como aviso.
 */
export async function llamarAccion<T>(llamada: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await llamada()
  } catch {
    return fallo(MENSAJE_SIN_CONEXION)
  }
}

/** Lo mismo para acciones de formulario de `useActionState`. Se envuelve a nivel de módulo (referencia estable). */
export function accionDeFormulario<T>(
  accion: (previo: Resultado<T> | null, formData: FormData) => Promise<Resultado<T>>,
): (previo: Resultado<T> | null, formData: FormData) => Promise<Resultado<T>> {
  return (previo, formData) => llamarAccion(() => accion(previo, formData))
}
