/*
 * El nombre de usuario con el que cada persona entra (perfiles.usuario) y la dirección interna que
 * Supabase Auth exige por cuenta. Puro: sirve en el servidor, en los formularios y en los scripts.
 */

/** Las cuentas nuevas se crean en Auth con `<uuid>@` este dominio: `.invalid` nunca recibe correo (RFC 2606). */
export const DOMINIO_INTERNO = 'cuentas.molino.invalid'

/** Una dirección interna que no es de nadie: con ella el login de un usuario inexistente sigue el mismo camino. */
export const DIRECCION_INEXISTENTE = `nadie@${DOMINIO_INTERNO}`

export const LARGO_MINIMO_USUARIO = 3
export const LARGO_MAXIMO_USUARIO = 30

/** Letras sin tilde y números, separados por un solo punto, guion o guion bajo. Igual que el check de la base. */
export const FORMATO_USUARIO = /^[a-z0-9]+([._-][a-z0-9]+)*$/

/** Reservado para las cuentas de los scripts de demo (scripts/demo): los formularios lo rechazan. */
export const PREFIJO_DEMO = 'demo.'

/** La misma lista en la migración 20261005110000 (pg_temp.limpiar_usuario): si cambia una, cambia la otra. */
const SIN_MARCA: Record<string, string> = { á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n' }

/** ' R.Flores ' → 'r.flores'; 'Muñoz' → 'munoz'. No valida: eso es `usuarioValido`. */
export function normalizarUsuario(texto: string): string {
  return texto
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (letra) => SIN_MARCA[letra])
}

export function usuarioValido(usuario: string): boolean {
  return usuario.length >= LARGO_MINIMO_USUARIO && usuario.length <= LARGO_MAXIMO_USUARIO && FORMATO_USUARIO.test(usuario)
}

/**
 * El usuario que la migración 20261005110000 le dio a una cuenta de la casa a partir de su correo: lo
 * de antes de la arroba, limpio. Así quien escribe su correo de siempre (o el teléfono lo rellena)
 * llega a su cuenta. No resuelve repetidos: a esos la migración les agregó `.2`, `.3`.
 */
export function usuarioDesdeCorreo(correo: string): string {
  const base = normalizarUsuario(correo.split('@')[0])
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/[._-]{2,}/g, (separadores) => separadores[0])
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, LARGO_MAXIMO_USUARIO)
    .replace(/[._-]+$/, '')
  // Menos de 3 caracteres no es un usuario válido. Y `demo.` es de las cuentas de demo: una cuenta
  // real cuyo correo empiece así no quedó con ese prefijo (limpiar-datos-demo la borraría).
  if (base.length >= LARGO_MINIMO_USUARIO && !base.startsWith(PREFIJO_DEMO)) return base
  return (base ? `cuenta.${base}` : 'cuenta').slice(0, LARGO_MAXIMO_USUARIO).replace(/[._-]+$/, '')
}

/** Lo que se escribió en el campo "Usuario" del login → el usuario a buscar. */
export function usuarioParaEntrar(texto: string): string {
  const limpio = normalizarUsuario(texto)
  return limpio.includes('@') ? usuarioDesdeCorreo(limpio) : limpio
}

export function direccionInterna(): string {
  return `${crypto.randomUUID()}@${DOMINIO_INTERNO}`
}

export function esDireccionInterna(correo: string | null | undefined): boolean {
  return correo?.endsWith(`@${DOMINIO_INTERNO}`) ?? false
}
