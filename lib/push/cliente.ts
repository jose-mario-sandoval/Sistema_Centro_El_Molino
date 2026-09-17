import { base64UrlABytes, evaluarSoporte, mismaLlaveServidor, type SoportePush } from './plataforma'

/*
 * Funciones del navegador (navigator, window, fetch): solo se importan desde Client Components.
 * La decisión de soporte está probada en plataforma.ts.
 */

export type EstadoDispositivo = 'sin-llave' | Exclude<SoportePush, 'disponible'> | 'inactivo' | 'activo'

export type ResultadoPush = { ok: true } | { ok: false; error: string }

/** Máximo que se espera a que el service worker quede activo antes de dar el error. */
const ESPERA_SERVICE_WORKER_MS = 10_000

class ErrorTiempoAgotado extends Error {}

/** Rechaza si `promesa` no termina a tiempo: evita quedarse en "Activando…" para siempre. */
function conTiempoLimite<T>(promesa: Promise<T>, ms: number, queEsperaba: string): Promise<T> {
  return new Promise<T>((resolver, rechazar) => {
    const temporizador = setTimeout(() => rechazar(new ErrorTiempoAgotado(queEsperaba)), ms)
    promesa.then(resolver, rechazar).finally(() => clearTimeout(temporizador))
  })
}

function leerSoporte(): SoportePush {
  const nav = navigator as Navigator & { standalone?: boolean }
  const hayNotificaciones = 'Notification' in window
  return evaluarSoporte({
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true,
    serviceWorker: 'serviceWorker' in nav,
    pushManager: 'PushManager' in window,
    notificaciones: hayNotificaciones,
    permiso: hayNotificaciones ? Notification.permission : null,
  })
}

async function suscripcionActual(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null
  const registro = await navigator.serviceWorker.getRegistration('/')
  return (await registro?.pushManager.getSubscription()) ?? null
}

async function enviarAlServidor(metodo: 'POST' | 'DELETE', cuerpo: unknown): Promise<boolean> {
  const respuesta = await fetch('/api/push', {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
    signal: AbortSignal.timeout(8000),
  })
  // Sin sesión el proxy responde 401 en /api; una redirección seguida (con 200) tampoco cuenta como éxito.
  return respuesta.ok && !respuesta.redirected
}

/** Estado de este dispositivo. Si ya tiene suscripción, la vuelve a asignar a la cuenta con sesión (spec §8.2). */
export async function revisarEsteDispositivo(llavePublica: string): Promise<EstadoDispositivo> {
  if (!llavePublica) return 'sin-llave'
  const soporte = leerSoporte()
  if (soporte !== 'disponible') return soporte
  try {
    const suscripcion = await suscripcionActual()
    if (!suscripcion || Notification.permission !== 'granted') return 'inactivo'
    // Con otra llave VAPID la suscripción ya no recibe nada: se muestra como inactiva para rehacerla.
    if (!mismaLlaveServidor(suscripcion.options.applicationServerKey, base64UrlABytes(llavePublica))) return 'inactivo'
    await enviarAlServidor('POST', suscripcion.toJSON())
    return 'activo'
  } catch (error) {
    console.error('[push] no se pudo revisar este dispositivo', error)
    return 'inactivo'
  }
}

/** Debe llamarse directamente desde el clic: iOS exige el gesto del usuario para pedir permiso. */
export async function activarEsteDispositivo(llavePublica: string): Promise<ResultadoPush> {
  const permiso = await Notification.requestPermission()
  if (permiso === 'denied') {
    return { ok: false, error: 'Bloqueaste las notificaciones. Habilitalas en los ajustes del navegador.' }
  }
  if (permiso !== 'granted') return { ok: false, error: 'No diste permiso para mostrar notificaciones.' }

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
    const registro = await conTiempoLimite(
      navigator.serviceWorker.ready,
      ESPERA_SERVICE_WORKER_MS,
      'el service worker no llegó a activarse',
    )

    const llave = base64UrlABytes(llavePublica)
    let suscripcion = await registro.pushManager.getSubscription()
    if (suscripcion && !mismaLlaveServidor(suscripcion.options.applicationServerKey, llave)) {
      // La llave VAPID del servidor cambió: la suscripción vieja no sirve y hay que rehacerla.
      await suscripcion.unsubscribe().catch(() => {})
      suscripcion = null
    }
    suscripcion ??= await registro.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: llave })

    if (!(await enviarAlServidor('POST', suscripcion.toJSON()))) {
      return { ok: false, error: 'No se pudo registrar este dispositivo. Intentá de nuevo.' }
    }
    return { ok: true }
  } catch (error) {
    console.error('[push] no se pudo activar este dispositivo', error)
    if (error instanceof ErrorTiempoAgotado) {
      return { ok: false, error: 'La app tardó demasiado en prepararse. Recargá la página e intentá de nuevo.' }
    }
    return { ok: false, error: 'No se pudieron activar las notificaciones en este dispositivo.' }
  }
}

/** Borra la suscripción en el servidor y la anula en el navegador. Nunca lanza. */
export async function desactivarEsteDispositivo(): Promise<ResultadoPush> {
  try {
    const suscripcion = await suscripcionActual()
    if (!suscripcion) return { ok: true }

    // En paralelo: al cerrar sesión el total está acotado a 4 segundos (BotonCerrarSesion).
    const [enServidor, enNavegador] = await Promise.allSettled([
      enviarAlServidor('DELETE', { endpoint: suscripcion.endpoint }),
      suscripcion.unsubscribe(),
    ])

    // Aunque el servidor falle, se anula igual: al próximo envío responderá 410 y se borrará (spec §8.2).
    if (enServidor.status === 'rejected' || !enServidor.value) {
      console.error('[push] el servidor no confirmó la baja de este dispositivo')
    }
    if (enNavegador.status === 'rejected') {
      console.error('[push] no se pudo anular la suscripción en el navegador', enNavegador.reason)
      return { ok: false, error: 'No se pudieron desactivar las notificaciones. Intentá de nuevo.' }
    }
    return { ok: true }
  } catch (error) {
    console.error('[push] no se pudo desactivar este dispositivo', error)
    return { ok: false, error: 'No se pudieron desactivar las notificaciones. Intentá de nuevo.' }
  }
}

/** Para "Cerrar sesión": da de baja el dispositivo sin bloquear la salida más de 4 segundos. Nunca lanza. */
export async function darDeBajaAlCerrarSesion(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  await Promise.race([desactivarEsteDispositivo(), new Promise<void>((resolver) => setTimeout(resolver, 4000))])
}
