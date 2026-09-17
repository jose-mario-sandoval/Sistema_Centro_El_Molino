import { fallo, type Resultado } from '@/lib/acciones/resultado'

export const MENSAJE_ACCION_FALLIDA = 'No se pudo completar la acción. Revisá tu conexión o recargá la página.'

/**
 * Llama una Server Action sin dejar que un rechazo de la promesa (sin red, "Failed to find Server Action"
 * después de un despliegue o un error inesperado del servidor) llegue al error boundary:
 * lo registra en la consola y lo convierte en un fallo que se muestra como aviso.
 */
export async function llamarAccion<T>(llamada: () => Promise<Resultado<T>>): Promise<Resultado<T>> {
  try {
    return await llamada()
  } catch (error) {
    console.error('No se pudo completar la Server Action', error)
    return fallo(MENSAJE_ACCION_FALLIDA)
  }
}

/** Lo mismo para acciones de formulario de `useActionState`. Se envuelve a nivel de módulo (referencia estable). */
export function accionDeFormulario<T>(
  accion: (previo: Resultado<T> | null, formData: FormData) => Promise<Resultado<T>>,
): (previo: Resultado<T> | null, formData: FormData) => Promise<Resultado<T>> {
  return (previo, formData) => llamarAccion(() => accion(previo, formData))
}
