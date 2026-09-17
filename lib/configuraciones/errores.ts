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
