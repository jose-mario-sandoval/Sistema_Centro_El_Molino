import { CLAVE_INSTALADA, CLAVE_YA_LA_INSTALE } from './instalar'

/*
 * Estado de la instalación en el navegador: si hay un `beforeinstallprompt` guardado (Android,
 * Chrome, Edge…) y si la app se acaba de instalar. Vive a nivel de módulo, no en un componente: el
 * evento llega una sola vez y puede llegar antes de que React monte (lo captura el script de
 * <head>, lib/pwa/instalar.ts), y en modo estricto un efecto se monta dos veces. Los componentes lo
 * leen con useSyncExternalStore. Solo se importa desde Client Components.
 */

/** El evento no estándar de Chromium: `prompt()` muestra el diálogo de instalar, una sola vez. */
export type EventoInstalar = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

declare global {
  interface Window {
    __molinoInstalar?: EventoInstalar | null
  }
}

export type EstadoInstalacion = { hayPrompt: boolean; instalada: boolean }

const EN_EL_SERVIDOR: EstadoInstalacion = { hayPrompt: false, instalada: false }

let estado: EstadoInstalacion = EN_EL_SERVIDOR
let enganchado = false
const oyentes = new Set<() => void>()

function cambiar(cambio: Partial<EstadoInstalacion>) {
  const nuevo = { ...estado, ...cambio }
  if (nuevo.hayPrompt === estado.hayPrompt && nuevo.instalada === estado.instalada) return
  estado = nuevo
  for (const oyente of oyentes) oyente()
}

function enganchar() {
  if (enganchado || typeof window === 'undefined') return
  enganchado = true
  estado = { hayPrompt: Boolean(window.__molinoInstalar), instalada: false }

  // Lo reenvía el script de <head> cada vez que el navegador ofrece instalar.
  window.addEventListener('molino:instalable', () => cambiar({ hayPrompt: Boolean(window.__molinoInstalar) }))
  // Chrome solo manda beforeinstallprompt si la app NO está instalada: si estaba anotada, la
  // desinstalaron. Si guardarlo (y el preventDefault) lo decide el script de <head>: solo en
  // teléfono o tablet; en la computadora sigue la invitación propia del navegador.
  window.addEventListener('beforeinstallprompt', () => {
    try {
      window.localStorage.removeItem(CLAVE_INSTALADA)
      window.localStorage.removeItem(CLAVE_YA_LA_INSTALE)
    } catch {
      // Sin almacenamiento: no había marca que borrar.
    }
    cambiar({ hayPrompt: Boolean(window.__molinoInstalar), instalada: false })
  })
  window.addEventListener('appinstalled', () => {
    window.__molinoInstalar = null
    try {
      window.localStorage.setItem(CLAVE_INSTALADA, '1')
    } catch {
      // Sin almacenamiento: esta vez se ve "Listo"; la próxima, la app instalada no muestra la franja.
    }
    cambiar({ hayPrompt: false, instalada: true })
  })
}

export function suscribirInstalacion(oyente: () => void): () => void {
  enganchar()
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}

export function leerInstalacion(): EstadoInstalacion {
  enganchar()
  return estado
}

export function leerInstalacionServidor(): EstadoInstalacion {
  return EN_EL_SERVIDOR
}

export type ResultadoInstalar = 'aceptada' | 'rechazada' | 'no-disponible'

/**
 * Muestra el diálogo de instalar del navegador. Tiene que llamarse desde el toque (gesto del
 * usuario). El evento sirve una sola vez: después, hasta que el navegador mande otro, no hay botón
 * nativo (la franja pasa a las instrucciones del menú).
 */
export async function pedirInstalacion(): Promise<ResultadoInstalar> {
  enganchar()
  const evento = window.__molinoInstalar
  if (!evento) return 'no-disponible'
  window.__molinoInstalar = null
  cambiar({ hayPrompt: false })
  try {
    await evento.prompt()
    const { outcome } = await evento.userChoice
    return outcome === 'accepted' ? 'aceptada' : 'rechazada'
  } catch (error) {
    console.error('[pwa] no se pudo mostrar el diálogo de instalar', error)
    return 'no-disponible'
  }
}

/**
 * Chrome en Android: ¿la app ya está instalada (por ejemplo, desde el menú)? Usa
 * `related_applications` del manifest, que apunta a sí mismo. Sin la API: no se sabe (false).
 */
export async function instaladaSegunNavegador(): Promise<boolean> {
  const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> }
  if (typeof nav.getInstalledRelatedApps !== 'function') return false
  try {
    return (await nav.getInstalledRelatedApps()).length > 0
  } catch {
    return false
  }
}
