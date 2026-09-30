import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CLAVE_INSTALADA, CLAVE_YA_LA_INSTALE } from '@/lib/pwa/instalar'

// El almacén vive en el navegador: acá, una ventana mínima con EventTarget y un localStorage en memoria.
type VentanaFalsa = EventTarget & { __molinoInstalar?: unknown; localStorage: Storage }

function eventoInstalar(outcome: 'accepted' | 'dismissed') {
  const evento = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  })
  return evento
}

let ventana: VentanaFalsa
let guardado: Record<string, string>

async function cargar() {
  vi.resetModules()
  return import('@/lib/pwa/instalacion')
}

beforeEach(() => {
  guardado = {}
  ventana = Object.assign(new EventTarget(), {
    localStorage: {
      getItem: (k: string) => guardado[k] ?? null,
      setItem: (k: string, v: string) => void (guardado[k] = v),
      removeItem: (k: string) => void delete guardado[k],
    } as unknown as Storage,
  })
  vi.stubGlobal('window', ventana)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('almacén de la instalación', () => {
  it('ve el evento que el script de <head> capturó antes de que cargara React', async () => {
    ventana.__molinoInstalar = eventoInstalar('accepted')
    const { leerInstalacion } = await cargar()
    expect(leerInstalacion()).toEqual({ hayPrompt: true, instalada: false })
  })

  it('se entera del evento que llega después y avisa a quien escucha', async () => {
    const { leerInstalacion, suscribirInstalacion } = await cargar()
    const oyente = vi.fn()
    suscribirInstalacion(oyente)
    expect(leerInstalacion().hayPrompt).toBe(false)
    ventana.__molinoInstalar = eventoInstalar('accepted')
    ventana.dispatchEvent(new Event('molino:instalable'))
    expect(oyente).toHaveBeenCalled()
    expect(leerInstalacion().hayPrompt).toBe(true)
  })

  it('la instantánea no cambia de identidad si nada cambió (useSyncExternalStore)', async () => {
    const { leerInstalacion } = await cargar()
    expect(leerInstalacion()).toBe(leerInstalacion())
  })

  it('pedirInstalacion muestra el diálogo del navegador una sola vez y devuelve lo que eligió', async () => {
    const evento = eventoInstalar('dismissed')
    ventana.__molinoInstalar = evento
    const { leerInstalacion, pedirInstalacion } = await cargar()
    expect(await pedirInstalacion()).toBe('rechazada')
    expect(evento.prompt).toHaveBeenCalledTimes(1)
    // El evento sirve una sola vez: hasta que el navegador mande otro, no hay botón nativo.
    expect(leerInstalacion().hayPrompt).toBe(false)
    expect(await pedirInstalacion()).toBe('no-disponible')
  })

  it('aceptada', async () => {
    ventana.__molinoInstalar = eventoInstalar('accepted')
    const { pedirInstalacion } = await cargar()
    expect(await pedirInstalacion()).toBe('aceptada')
  })

  it('appinstalled: queda instalada y anotada en el dispositivo', async () => {
    ventana.__molinoInstalar = eventoInstalar('accepted')
    const { leerInstalacion, suscribirInstalacion } = await cargar()
    const oyente = vi.fn()
    suscribirInstalacion(oyente)
    ventana.dispatchEvent(new Event('appinstalled'))
    expect(leerInstalacion()).toEqual({ hayPrompt: false, instalada: true })
    expect(guardado[CLAVE_INSTALADA]).toBe('1')
    expect(oyente).toHaveBeenCalled()
  })
})

describe('beforeinstallprompt: Chrome solo lo manda si la app no está instalada', () => {
  it('borra las marcas de instalada y vuelve a ofrecer instalar; el preventDefault lo decide el script', async () => {
    guardado[CLAVE_INSTALADA] = '1'
    guardado[CLAVE_YA_LA_INSTALE] = '1900000000000'
    const { leerInstalacion, suscribirInstalacion } = await cargar()
    suscribirInstalacion(() => {})
    ventana.dispatchEvent(new Event('appinstalled'))
    expect(leerInstalacion().instalada).toBe(true)

    const evento = eventoInstalar('accepted')
    const prevenir = vi.spyOn(evento, 'preventDefault')
    // El script de <head> ya lo guardó (teléfono o tablet).
    ventana.__molinoInstalar = evento
    ventana.dispatchEvent(evento)
    expect(guardado[CLAVE_INSTALADA]).toBeUndefined()
    expect(guardado[CLAVE_YA_LA_INSTALE]).toBeUndefined()
    expect(leerInstalacion()).toEqual({ hayPrompt: true, instalada: false })
    expect(prevenir).not.toHaveBeenCalled()
  })

  it('si el script no lo guardó (computadora), no hay botón nativo', async () => {
    const { leerInstalacion, suscribirInstalacion } = await cargar()
    suscribirInstalacion(() => {})
    ventana.dispatchEvent(eventoInstalar('accepted'))
    expect(leerInstalacion().hayPrompt).toBe(false)
  })
})
