export type SoportePush = 'ios-instalar' | 'sin-soporte' | 'bloqueado' | 'disponible'

/** Lo que el navegador informa; lo lee lib/push/cliente.ts. */
export type EntornoNavegador = {
  userAgent: string
  maxTouchPoints: number
  /** La app corre instalada (display-mode standalone o navigator.standalone en iOS). */
  standalone: boolean
  serviceWorker: boolean
  pushManager: boolean
  notificaciones: boolean
  permiso: 'default' | 'granted' | 'denied' | null
}

export function esIOS(p: { userAgent: string; maxTouchPoints: number }): boolean {
  if (/iPhone|iPad|iPod/.test(p.userAgent)) return true
  // iPadOS 13+ se presenta como Mac; se distingue por la pantalla táctil.
  return /Macintosh/.test(p.userAgent) && p.maxTouchPoints > 1
}

/** En iOS, Web Push solo existe con la app agregada a la pantalla de inicio (iOS 16.4+, spec §8.2). */
export function evaluarSoporte(e: EntornoNavegador): SoportePush {
  if (esIOS(e) && !e.standalone) return 'ios-instalar'
  if (!e.serviceWorker || !e.pushManager || !e.notificaciones) return 'sin-soporte'
  if (e.permiso === 'denied') return 'bloqueado'
  return 'disponible'
}

/** Llave pública VAPID (base64url) → bytes para pushManager.subscribe. */
export function base64UrlABytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const relleno = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + relleno).replace(/-/g, '+').replace(/_/g, '/')
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  return bytes
}
