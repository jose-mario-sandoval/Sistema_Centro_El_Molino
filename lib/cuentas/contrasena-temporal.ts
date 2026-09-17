/** Sin 0/o ni 1/l/i: se dicta o se copia a mano sin confusiones. */
export const ALFABETO_CONTRASENA = 'abcdefghjkmnpqrstuvwxyz23456789'

const SIMBOLOS = 12
const TAMANO_GRUPO = 4

function bytesSeguros(cantidad: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(cantidad))
}

/**
 * Contraseña temporal legible: 12 símbolos aleatorios en tres grupos (`k7hm-pq3x-wn9d`).
 * Usa Web Crypto (navegador y Node 24). `bytesAleatorios` solo se reemplaza en pruebas.
 */
export function generarContrasenaTemporal(
  bytesAleatorios: (cantidad: number) => Uint8Array = bytesSeguros,
): string {
  // Descartar los bytes >= límite evita el sesgo de `byte % 31`.
  const limite = 256 - (256 % ALFABETO_CONTRASENA.length)
  const simbolos: string[] = []

  while (simbolos.length < SIMBOLOS) {
    for (const byte of bytesAleatorios(SIMBOLOS)) {
      if (byte >= limite) continue
      simbolos.push(ALFABETO_CONTRASENA[byte % ALFABETO_CONTRASENA.length])
      if (simbolos.length === SIMBOLOS) break
    }
  }

  const grupos: string[] = []
  for (let i = 0; i < SIMBOLOS; i += TAMANO_GRUPO) {
    grupos.push(simbolos.slice(i, i + TAMANO_GRUPO).join(''))
  }
  return grupos.join('-')
}
