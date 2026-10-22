'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { InsigniaPendientes } from '@/components/app/pendientes'
import { Icono, type NombreIcono } from '@/components/ui/iconos'
import type { Rol } from '@/lib/perfiles/roles'
import { puedeVerPensiones } from '@/lib/pensiones/permisos'

// "Ajustes" y no "Configuraciones": cabe en la barra inferior y es el nombre que la gente ya
// conoce del teléfono.
const SECCIONES: readonly { ruta: string; prefijo: string; etiqueta: string; icono: NombreIcono }[] = [
  { ruta: '/comidas/semana', prefijo: '/comidas', etiqueta: 'Comidas', icono: 'comidas' },
  { ruta: '/mensajes', prefijo: '/mensajes', etiqueta: 'Mensajes', icono: 'mensajes' },
  { ruta: '/calendario', prefijo: '/calendario', etiqueta: 'Calendario', icono: 'calendario' },
  { ruta: '/pensiones', prefijo: '/pensiones', etiqueta: 'Pensiones', icono: 'pensiones' },
  { ruta: '/configuraciones', prefijo: '/configuraciones', etiqueta: 'Ajustes', icono: 'ajustes' },
]

/** Desplaza solo el carril horizontal: enfocar una sección no mueve la página. */
function mostrarEnlace(fila: HTMLElement, enlace: HTMLElement) {
  const a = enlace.getBoundingClientRect()
  const f = fila.getBoundingClientRect()
  if (a.left < f.left || a.right > f.right) fila.scrollLeft += a.left + a.width / 2 - (f.left + f.width / 2)
}

function Enlaces({ rol }: { rol: Rol }) {
  const ruta = usePathname()
  return SECCIONES.filter((s) => s.prefijo !== '/pensiones' || puedeVerPensiones(rol)).map((s) => {
    const activa = ruta.startsWith(s.prefijo)
    return (
      <Link
        key={s.ruta}
        href={s.ruta}
        className={`nav-item${activa ? ' active' : ''}`}
        aria-current={activa ? 'page' : undefined}
      >
        <Icono nombre={s.icono} />
        <span>{s.etiqueta}</span>
        {/* Solo el Director tiene conteo (ProveedorPendientes); para los demás no pinta nada. */}
        {s.ruta === '/mensajes' && <InsigniaPendientes />}
      </Link>
    )
  })
}

/** Escritorio: en el lateral. */
export function NavegacionLateral({ rol }: { rol: Rol }) {
  return (
    <nav className="nav" aria-label="Secciones">
      <Enlaces rol={rol} />
    </nav>
  )
}

/**
 * Teléfono: todos los destinos en una sola fila, con su etiqueta completa y a tamaño de letra normal. Si con el
 * ancho y la letra elegidos no caben, la fila se desplaza (con el dedo, con el teclado o con el botón de la
 * derecha, que lleva al final y luego al principio) y la sección actual se trae a la vista. Si caben, no hay botón.
 */
export function NavegacionInferior({ rol }: { rol: Rol }) {
  const ruta = usePathname()
  const barra = useRef<HTMLElement>(null)
  const carril = useRef<HTMLDivElement>(null)
  const [desborda, setDesborda] = useState(false)
  const [alFinal, setAlFinal] = useState(false)

  const medir = useCallback(() => {
    const fila = carril.current
    const nav = barra.current
    if (!fila || !nav) return
    // Incluye el área segura y cualquier crecimiento por la letra elegida.
    document.documentElement.style.setProperty('--alto-barra-inferior', `${nav.getBoundingClientRect().height}px`)
    // ¿Cabe todo en el ancho de la barra (sin contar el botón, que solo aparece si no cabe)?
    const estilo = getComputedStyle(nav)
    const disponible = nav.clientWidth - parseFloat(estilo.paddingLeft) - parseFloat(estilo.paddingRight)
    setDesborda(fila.scrollWidth > disponible + 1)
    setAlFinal(fila.scrollLeft + fila.clientWidth >= fila.scrollWidth - 2)
  }, [])

  // Mide al montar y cada vez que cambia el tamaño de la barra o de la fila (giro, letra más grande, teclado).
  useLayoutEffect(() => {
    medir()
    if (typeof ResizeObserver === 'undefined') return
    const observador = new ResizeObserver(medir)
    if (barra.current) observador.observe(barra.current)
    if (carril.current) observador.observe(carril.current)
    return () => observador.disconnect()
  }, [medir])

  // Safari puede desplazar o reducir el viewport visible (teclado, barras del navegador, zoom)
  // sin cambiar el viewport de layout al que se ancla position:fixed.
  useLayoutEffect(() => {
    const nav = barra.current
    const viewport = window.visualViewport
    if (!nav) return
    let cuadro = 0

    function ajustar() {
      cuadro = 0
      if (!nav || !viewport || !nav.getClientRects().length) return
      nav.style.setProperty('--izquierda-barra-inferior', `${viewport.offsetLeft}px`)
      nav.style.setProperty('--ancho-barra-inferior', `${viewport.width}px`)
      // Recuperar el borde sin el ajuste anterior evita acumular desplazamientos. Medir
      // la barra también cubre navegadores que recolocan los fixed por su cuenta.
      const anterior = parseFloat(getComputedStyle(nav).bottom) || 0
      const siguiente = anterior + nav.getBoundingClientRect().bottom - (viewport.offsetTop + viewport.height)
      if (Math.abs(siguiente - anterior) > 0.5) {
        document.documentElement.style.setProperty('--desplazamiento-barra-inferior', `${siguiente}px`)
      }
      medir()
    }

    function programar() {
      if (!cuadro) cuadro = requestAnimationFrame(ajustar)
    }

    ajustar()
    viewport?.addEventListener('resize', programar)
    viewport?.addEventListener('scroll', programar)
    window.addEventListener('resize', programar)
    window.addEventListener('pageshow', programar)
    return () => {
      cancelAnimationFrame(cuadro)
      viewport?.removeEventListener('resize', programar)
      viewport?.removeEventListener('scroll', programar)
      window.removeEventListener('resize', programar)
      window.removeEventListener('pageshow', programar)
      document.documentElement.style.removeProperty('--alto-barra-inferior')
      document.documentElement.style.removeProperty('--desplazamiento-barra-inferior')
    }
  }, [medir])

  // La sección actual queda a la vista (al entrar, y al cambiar de sección si la fila está desplazada).
  useLayoutEffect(() => {
    const fila = carril.current
    const activa = fila?.querySelector<HTMLElement>('.nav-item.active')
    if (!fila || !activa) return
    mostrarEnlace(fila, activa)
    medir()
  }, [ruta, desborda, medir])

  function desplazar() {
    const fila = carril.current
    if (!fila) return
    const sinAnimar = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    fila.scrollTo({ left: alFinal ? 0 : fila.scrollLeft + fila.clientWidth * 0.75, behavior: sinAnimar ? 'auto' : 'smooth' })
  }

  return (
    <nav ref={barra} className="barra-inferior" aria-label="Secciones">
      <div ref={carril} className="barra-carril" onScroll={medir} onFocus={(evento) => {
        const enlace = evento.target.closest<HTMLElement>('.nav-item')
        if (enlace) mostrarEnlace(evento.currentTarget, enlace)
      }}>
        <Enlaces rol={rol} />
      </div>
      {desborda && (
        <button
          type="button"
          className="icon-btn barra-flecha"
          aria-label={alFinal ? 'Volver al principio de las secciones' : 'Ver más secciones'}
          onClick={desplazar}
        >
          <Icono nombre={alFinal ? 'izquierda' : 'derecha'} />
        </button>
      )}
    </nav>
  )
}
