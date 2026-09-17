import { isAuthRetryableFetchError, type AuthError } from '@supabase/supabase-js'

export const MENSAJE_CORREO_REPETIDO = 'Ya existe una cuenta con ese correo.'
export const MENSAJE_DIRECTOR_MINIMO = 'Debe quedar al menos un Director activo.'

/**
 * Traduce errores de Postgres al escribir `perfiles`:
 * - MOL02: trigger de Director activo mínimo (spec §3.3, índice §3.4);
 * - 23505: unicidad de `perfiles.correo`.
 */
export function mensajeErrorPerfil(error: { code?: string } | null, respaldo: string): string {
  if (error?.code === 'MOL02') return MENSAJE_DIRECTOR_MINIMO
  if (error?.code === '23505') return MENSAJE_CORREO_REPETIDO
  return respaldo
}

/** Errores de `perfiles` que son reglas del negocio (se muestran tal cual) y no fallas a registrar. */
export function esErrorPerfilEsperado(error: { code?: string } | null): boolean {
  return error?.code === 'MOL02' || error?.code === '23505'
}

/**
 * Un error de Auth es definitivo cuando Auth respondió y rechazó el pedido (4xx): el cambio no se aplicó.
 * Sin respuesta (red, tiempo agotado), con un 5xx o sin estado no se sabe si se aplicó: es ambiguo.
 */
export function esErrorAuthDefinitivo(error: AuthError): boolean {
  return !isAuthRetryableFetchError(error) && (error.status ?? 500) < 500
}
