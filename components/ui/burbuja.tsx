'use client'

import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { calcularPosicion, cuantoDesplazar, esToque, siguienteDespues, type Lado } from '@/lib/burbuja'

/**
 * Por qué se cierra: 'listo' (su botón, o volver a tocar lo que la abrió), 'escape' (el único que
 * descarta lo escrito), 'fuera' (un toque o el foco fuera de ella) y 'tab' (Tab desde su último
 * control). Quien la usa decide: guarda lo escrito o, si no sirve, no la cierra.
 */
export type MotivoCierre = 'listo' | 'escape' | 'fuera' | 'tab'

const ENFOCABLES = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

function enfocables(raiz: ParentNode): HTMLElement[] {
  return Array.from(raiz.querySelectorAll<HTMLElement>(ENFOCABLES)).filter((e) => e.getClientRects().length > 0)
}

/** Lo que tapa el final de la pantalla y no cuenta como lugar libre: la barra inferior del teléfono. */
function reservaAbajo(): number {
  const barra = document.querySelector('.barra-inferior')
  const alto = barra?.getBoundingClientRect()
  if (!alto || alto.height === 0) return 0
  return Math.max(0, window.innerHeight - alto.top)
}

/**
 * Después de cerrar, el foco vuelve al botón que abrió la burbuja (DESIGN.md §7): nunca queda en la
 * nada. Si la cerró un toque en otro control, el foco ya está ahí y no se lo quita; con Tab, la
 * burbuja ya lo llevó al control siguiente.
 */
export function devolverFoco(motivo: MotivoCierre, ancla: HTMLElement | null) {
  if (motivo === 'tab') return
  if (motivo === 'fuera') {
    const activo = document.activeElement
    if (activo && activo !== document.body && !activo.closest('.burbuja')) return
  }
  ancla?.focus({ preventScroll: true })
}

/**
 * La burbuja de una comida (DESIGN.md §8): una capa pasajera junto a lo que se tocó, con una flecha
 * que lo señala. No es un modal: no oscurece nada ni atrapa el foco, y la página sigue ahí.
 *
 * - Va en un portal sobre `document.body`, en `position:absolute` calculada acá (lib/burbuja.ts):
 *   debajo del botón, arriba si abajo no entra, siempre dentro de la pantalla. Sin API Popover ni
 *   posicionamiento por ancla de CSS, que los iPhone con iOS 15 no tienen.
 * - Al abrir, el foco entra a la opción marcada (o al primer control); Escape la cierra descartando;
 *   un toque fuera (no un desplazamiento) o el foco fuera la cierran como "Listo". Si quien la usa no
 *   la deja cerrar (una nota que no sirve), el toque no llega a su destino: nada escrito se pierde
 *   en silencio.
 * - Orden de tabulación como si estuviera justo después de su botón: Tab desde el botón entra,
 *   Mayús+Tab desde el primer control vuelve al botón y Tab desde el último sale al control siguiente.
 * - Los otros botones que abren burbujas llevan `data-abre-burbuja`: tocarlos no cuenta como fuera;
 *   su propio clic cierra esta (con las reglas de "Listo") y abre la suya.
 */
export function Burbuja({
  id,
  ancla,
  tituloId,
  className,
  enfocarDialogo = false,
  alCerrar,
  children,
}: {
  id: string
  /** El botón que la abrió: la flecha lo señala y el foco vuelve a él. */
  ancla: RefObject<HTMLElement | null>
  /** Id del título (nombre accesible del diálogo). */
  tituloId: string
  className?: string
  /** Al abrir, el foco va a la burbuja y no a un control: así el teléfono no abre el teclado solo. */
  enfocarDialogo?: boolean
  /** Pedido de cierre por Escape, un toque o el foco fuera, o Tab; true si se cerró. */
  alCerrar: (motivo: MotivoCierre) => boolean
  children: ReactNode
}) {
  const burbuja = useRef<HTMLDivElement>(null)
  const lado = useRef<Lado | null>(null)
  const anchoVista = useRef(0)
  const cerrada = useRef(false)
  const pedirCierre = useRef(alCerrar)
  const observador = useRef<ResizeObserver | null>(null)
  const observada = useRef<HTMLElement | null>(null)
  // El foco estaba dentro de la burbuja (lo que se tocó o se tabuló por última vez).
  const focoDentro = useRef(false)

  useLayoutEffect(() => {
    pedirCierre.current = alCerrar
  })

  // El foco nunca queda en la nada (DESIGN.md §7): si el control que lo tenía desapareció al volver a
  // pintar (el campo de la hora después de "Guardar", "Volver a mi plan", un botón que se deshabilita),
  // vuelve a la opción marcada o a la burbuja, sin mover la página.
  useLayoutEffect(() => {
    const elemento = burbuja.current
    const activo = document.activeElement
    if (!elemento || !focoDentro.current || (activo && activo !== document.body)) return
    ;(elemento.querySelector<HTMLElement>('[aria-pressed="true"]') ?? elemento).focus({ preventScroll: true })
  })

  function colocar() {
    const elemento = burbuja.current
    const boton = ancla.current
    if (!elemento || !boton || !boton.isConnected) return
    // El botón puede cambiar de lugar o de elemento (La casa reagrupa a quien cambió de opción).
    if (boton !== observada.current) {
      if (observada.current) observador.current?.unobserve(observada.current)
      observador.current?.observe(boton)
      observada.current = boton
    }
    const vista = { ancho: document.documentElement.clientWidth, alto: window.innerHeight }
    // Otro ancho (el teléfono se giró): se vuelve a elegir el lado; si no, se conserva.
    if (vista.ancho !== anchoVista.current) {
      anchoVista.current = vista.ancho
      lado.current = null
    }
    const posicion = calcularPosicion({
      ancla: boton.getBoundingClientRect(),
      tamano: { ancho: elemento.offsetWidth, alto: elemento.offsetHeight },
      vista,
      desplazamiento: { x: window.scrollX, y: window.scrollY },
      reservaAbajo: reservaAbajo(),
      lado: lado.current,
    })
    lado.current = posicion.lado
    elemento.style.top = `${posicion.top}px`
    elemento.style.left = `${posicion.left}px`
    elemento.style.setProperty('--flecha', `${posicion.flecha}px`)
    elemento.dataset.lado = posicion.lado
  }

  // En cada pintada: el contenido o el botón pudieron moverse.
  useLayoutEffect(colocar)

  // Al abrir: el foco entra y, si no se ve entera, la página baja lo justo (el botón sigue a la vista).
  useLayoutEffect(() => {
    const elemento = burbuja.current
    const boton = ancla.current
    if (!elemento || !boton) return
    const destino = enfocarDialogo
      ? elemento
      : (elemento.querySelector<HTMLElement>('[aria-pressed="true"]') ?? enfocables(elemento)[0] ?? elemento)
    destino.focus({ preventScroll: true })
    focoDentro.current = true
    const bajar = cuantoDesplazar({
      burbuja: elemento.getBoundingClientRect(),
      ancla: boton.getBoundingClientRect(),
      vista: { alto: window.innerHeight },
      reservaAbajo: reservaAbajo(),
    })
    if (bajar > 0) {
      const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      window.scrollBy({ top: bajar, behavior: quieto ? 'auto' : 'smooth' })
    }
    // Solo al abrir; quien la usa le pone una `key` por comida.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // En un efecto de diseño y no en uno común: al pasar de una burbuja a otra, la que se va deja de
  // escuchar antes de que la nueva tome el foco (si no, ese foco "fuera" de la vieja cerraría la nueva).
  useLayoutEffect(() => {
    cerrada.current = false
    let inicio: { x: number; y: number; id: number } | null = null
    let bloquearClic = 0
    let cuadro = 0

    const intentar = (motivo: MotivoCierre): boolean => {
      if (cerrada.current || !burbuja.current?.isConnected) return true
      const cerro = pedirCierre.current(motivo)
      if (cerro) cerrada.current = true
      return cerro
    }
    const esPropio = (nodo: EventTarget | null) =>
      nodo instanceof Node && (Boolean(burbuja.current?.contains(nodo)) || Boolean(ancla.current?.contains(nodo)))
    const abreOtra = (nodo: EventTarget | null) => nodo instanceof Element && nodo.closest('[data-abre-burbuja]') !== null

    // Un toque fuera: bajar y subir el dedo casi en el mismo lugar. Desplazar la página no cuenta.
    function alBajar(e: PointerEvent) {
      inicio = null
      if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
      if (esPropio(e.target) || abreOtra(e.target)) return
      inicio = { x: e.clientX, y: e.clientY, id: e.pointerId }
    }
    function alSubir(e: PointerEvent) {
      const desde = inicio
      inicio = null
      if (!desde || desde.id !== e.pointerId || !esToque(desde, { x: e.clientX, y: e.clientY })) return
      // No se pudo cerrar (la nota no sirve y el error está a la vista): ese toque no hace nada más.
      if (!intentar('fuera')) bloquearClic = e.timeStamp
    }
    function alCancelar() {
      inicio = null
    }
    function alClic(e: MouseEvent) {
      if (bloquearClic && e.timeStamp - bloquearClic < 1000) {
        e.preventDefault()
        e.stopPropagation()
      }
      bloquearClic = 0
    }
    function alEnfocar(e: FocusEvent) {
      focoDentro.current = e.target instanceof Node && Boolean(burbuja.current?.contains(e.target))
      if (esPropio(e.target) || abreOtra(e.target)) return
      intentar('fuera')
    }
    function alTeclear(e: KeyboardEvent) {
      const elemento = burbuja.current
      const boton = ancla.current
      if (!elemento || !(e.target instanceof Node)) return
      const enBurbuja = elemento.contains(e.target)
      const enBoton = e.target === boton
      // Escape también cierra si el foco quedó en la nada: la burbuja abierta es lo único que hay para cerrar.
      const enNada = e.target === document.body && e.key === 'Escape'
      if (!enBurbuja && !enBoton && !enNada) return

      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        intentar('escape')
        return
      }
      if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey) return
      const controles = enfocables(elemento)
      if (enBoton) {
        if (e.shiftKey || controles.length === 0) return
        e.preventDefault()
        controles[0].focus()
        return
      }
      if (e.shiftKey) {
        if (e.target !== controles[0] && e.target !== elemento) return
        e.preventDefault()
        boton?.focus()
        return
      }
      // Sin Array.prototype.at: no existe en iOS 15.0–15.3.
      if (controles.length > 0 && e.target !== controles[controles.length - 1]) return
      e.preventDefault()
      if (!intentar('tab')) return
      const siguiente = boton ? siguienteDespues(enfocables(document), boton, (x) => x.closest('.burbuja') !== null) : null
      ;(siguiente ?? boton)?.focus()
    }
    function reubicar() {
      cancelAnimationFrame(cuadro)
      cuadro = requestAnimationFrame(colocar)
    }

    observador.current = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reubicar)
    if (burbuja.current) observador.current?.observe(burbuja.current)
    if (ancla.current) {
      observador.current?.observe(ancla.current)
      observada.current = ancla.current
    }

    document.addEventListener('pointerdown', alBajar, true)
    document.addEventListener('pointerup', alSubir, true)
    document.addEventListener('pointercancel', alCancelar, true)
    window.addEventListener('click', alClic, true)
    document.addEventListener('focusin', alEnfocar)
    window.addEventListener('keydown', alTeclear, true)
    window.addEventListener('resize', reubicar)
    // En la página no hace falta (la burbuja se mueve con ella), pero sí si se desplaza algo que la contiene.
    window.addEventListener('scroll', reubicar, { capture: true, passive: true })
    return () => {
      cerrada.current = true
      cancelAnimationFrame(cuadro)
      observador.current?.disconnect()
      observador.current = null
      observada.current = null
      document.removeEventListener('pointerdown', alBajar, true)
      document.removeEventListener('pointerup', alSubir, true)
      document.removeEventListener('pointercancel', alCancelar, true)
      window.removeEventListener('click', alClic, true)
      document.removeEventListener('focusin', alEnfocar)
      window.removeEventListener('keydown', alTeclear, true)
      window.removeEventListener('resize', reubicar)
      window.removeEventListener('scroll', reubicar, { capture: true })
    }
    // Una sola vez: `colocar` e `intentar` leen todo por refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={burbuja}
      id={id}
      role="dialog"
      aria-labelledby={tituloId}
      tabIndex={-1}
      className={className ? `burbuja ${className}` : 'burbuja'}
    >
      <span className="burbuja-flecha" aria-hidden="true" />
      {children}
    </div>,
    document.body,
  )
}
