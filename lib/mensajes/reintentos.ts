/** Primera espera antes de reintentar (recarga del feed o canal nuevo). */
export const ESPERA_INICIAL_MS = 3_000
/** Tope de la espera: nunca más de 5 minutos entre reintentos. */
export const ESPERA_MAXIMA_MS = 5 * 60_000
/** Recargas fallidas seguidas, con red, antes de pedir un router.refresh(). */
export const FALLOS_ANTES_DE_REFRESCAR = 3

/**
 * Espera antes del reintento número `intento` (0 = el primero): 3 s, 6 s, 12 s… hasta 5 min, con ±20 %
 * de azar para que varias pestañas caídas a la vez no reintenten todas en el mismo instante.
 */
export function esperaReintento(intento: number, azar: () => number = Math.random): number {
  const base = Math.min(ESPERA_INICIAL_MS * 2 ** Math.max(0, intento), ESPERA_MAXIMA_MS)
  return Math.min(Math.round(base * (0.8 + 0.4 * azar())), ESPERA_MAXIMA_MS)
}

/** Recargas fallidas seguidas desde la última sincronización correcta. */
export type RachaFallos = { fallos: number; refrescado: boolean }

export const RACHA_INICIAL: RachaFallos = { fallos: 0, refrescado: false }

/**
 * Suma una recarga fallida. Sin red no cuenta: el fallo se explica solo. `refrescar` es true una única vez
 * por racha, al llegar a FALLOS_ANTES_DE_REFRESCAR: con la red bien, lo probable es una sesión vencida
 * (exigirPerfil manda a /login) o un despliegue nuevo (Next hace una navegación completa).
 */
export function registrarFallo(racha: RachaFallos, enLinea: boolean): { racha: RachaFallos; refrescar: boolean } {
  if (!enLinea) return { racha, refrescar: false }
  const fallos = racha.fallos + 1
  const refrescar = !racha.refrescado && fallos >= FALLOS_ANTES_DE_REFRESCAR
  return { racha: { fallos, refrescado: racha.refrescado || refrescar }, refrescar }
}

export type Reintento = {
  /** Programa la acción para dentro de `ms`; reemplaza lo que hubiera programado. */
  programar: (ms: number) => void
  /** Si hay un reintento programado o en pausa, lo corre ya (p. ej. al volver a la pestaña). */
  ahora: () => void
  cancelar: () => void
}

/**
 * Un reintento a la vez. Si al vencer la espera la pestaña está oculta, queda en pausa (sin temporizador)
 * hasta que se llame a `ahora()` con la pestaña visible.
 */
export function crearReintento(accion: () => void, estaOculta: () => boolean): Reintento {
  let temporizador: ReturnType<typeof setTimeout> | undefined
  let pendiente = false

  function correr() {
    clearTimeout(temporizador)
    temporizador = undefined
    if (estaOculta()) return
    pendiente = false
    accion()
  }

  return {
    programar(ms) {
      clearTimeout(temporizador)
      pendiente = true
      temporizador = setTimeout(correr, ms)
    },
    ahora() {
      if (pendiente) correr()
    },
    cancelar() {
      clearTimeout(temporizador)
      temporizador = undefined
      pendiente = false
    },
  }
}
