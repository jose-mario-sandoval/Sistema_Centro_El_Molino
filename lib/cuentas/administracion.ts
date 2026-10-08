/*
 * La casa no ve el nombre real de Administración: sus cuentas se llaman "Administración N" / "AN".
 * El número sale de los nombres que ya existen (de cualquier rol, activos o no): no hay contador.
 * Espejo en SQL: el relleno de la migración 20261005110000.
 */

export function nombreAdministracion(numero: number): string {
  return `Administración ${numero}`
}

export function siglasAdministracion(numero: number): string {
  return `A${numero}`
}

export function usuarioSugeridoAdministracion(numero: number): string {
  return `admin.${numero}`
}

/** 12 para 'Administración 12'; null si el nombre no es uno genérico. */
export function numeroDeAdministracion(nombre: string): number | null {
  const coincidencia = /^Administración (\d+)$/.exec(nombre)
  return coincidencia ? Number(coincidencia[1]) : null
}

/** 1 + el mayor número que lleve algún perfil (así no se repite uno que alguien todavía usa). */
export function siguienteNumeroAdministracion(nombres: readonly string[]): number {
  return Math.max(0, ...nombres.map((nombre) => numeroDeAdministracion(nombre) ?? 0)) + 1
}
