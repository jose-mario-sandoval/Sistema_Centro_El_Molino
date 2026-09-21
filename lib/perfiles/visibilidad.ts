import type { Rol } from './roles'

/**
 * Regla de privacidad del centro: Administración vive en otra parte de la casa y no conoce el
 * nombre de las demás personas; solo ve sus siglas, en todas las pantallas y en las notificaciones.
 *
 * Se aplica en el servidor, antes de que el dato llegue al navegador: ocultar el nombre en la
 * pantalla no serviría si ya viajó en la respuesta.
 *
 * Sin rol conocido (sin sesión) se elige lo más privado.
 */
export function veSoloSiglas(rolObservador: Rol | null | undefined): boolean {
  return rolObservador == null || rolObservador === 'administracion'
}

/** La persona tal como la ve `rolObservador`: para Administración, `nombre` pasa a ser las siglas. */
export function paraObservador<T extends { nombre: string; siglas: string }>(
  persona: T,
  rolObservador: Rol | null | undefined,
): T {
  return veSoloSiglas(rolObservador) ? { ...persona, nombre: persona.siglas } : persona
}
