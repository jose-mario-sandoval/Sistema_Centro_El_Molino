import { createHash, timingSafeEqual } from 'node:crypto'

/** Compara "Authorization: Bearer <secreto>" con CRON_SECRET en tiempo constante. */
export function secretoCronValido(cabecera: string | null, secreto: string | undefined): boolean {
  if (!secreto || !cabecera?.startsWith('Bearer ')) return false
  const recibido = createHash('sha256').update(cabecera.slice('Bearer '.length)).digest()
  const esperado = createHash('sha256').update(secreto).digest()
  return timingSafeEqual(recibido, esperado)
}
