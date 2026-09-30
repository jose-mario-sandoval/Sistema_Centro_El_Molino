'use client'

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import { Icono } from '@/components/ui/iconos'
import {
  instaladaSegunNavegador,
  leerInstalacion,
  leerInstalacionServidor,
  pedirInstalacion,
  suscribirInstalacion,
} from '@/lib/pwa/instalacion'
import {
  CLAVE_INSTALADA,
  esTelefonoOTablet,
  navegadorIOS,
  PASOS_GENERICOS,
  pasosIOS,
  REQUISITO_IOS,
  varianteInstalar,
  type NavegadorIOS,
  type VarianteInstalar,
} from '@/lib/pwa/instalar'
import { esIOS } from '@/lib/push/plataforma'

/*
 * Piezas de "Instalar la app" que comparten la franja de arriba (components/app/invitaciones.tsx)
 * y la tarjeta de Ajustes: qué aparato es, qué variante corresponde y los pasos dibujados.
 */

type Aparato = { movil: boolean; ios: boolean; standalone: boolean; instaladaAntes: boolean; navegador: NavegadorIOS }

let aparato: Aparato | null = null

/** Se calcula una vez: el aparato no cambia mientras la página está abierta. */
function leerAparato(): Aparato {
  if (aparato) return aparato
  const nav = navigator as Navigator & { standalone?: boolean }
  const datos = { userAgent: nav.userAgent, maxTouchPoints: nav.maxTouchPoints ?? 0 }
  let instaladaAntes = false
  try {
    instaladaAntes = window.localStorage.getItem(CLAVE_INSTALADA) === '1'
  } catch {
    // Sin almacenamiento: no se sabe, y no importa (la franja se descarta igual).
  }
  aparato = {
    movil: esTelefonoOTablet(datos),
    ios: esIOS(datos),
    standalone: window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true,
    instaladaAntes,
    navegador: navegadorIOS(datos),
  }
  return aparato
}

const sinCambios = () => () => {}

/** El aparato, o null en el servidor y durante la hidratación (así el HTML coincide). */
export function useAparato(): Aparato | null {
  return useSyncExternalStore(sinCambios, leerAparato, () => null)
}

export type FaseInstalar = 'ofrecer' | 'instalando' | 'lista'

/** Qué ofrecer y qué hace "Instalar": el diálogo del navegador o desplegar los pasos. */
export function useInstalar() {
  const { hayPrompt, instalada } = useSyncExternalStore(suscribirInstalacion, leerInstalacion, leerInstalacionServidor)
  const datos = useAparato()
  const [pasosAbiertos, setPasosAbiertos] = useState(false)
  const [esperando, setEsperando] = useState(false)
  const [aceptada, setAceptada] = useState(false)

  const variante: VarianteInstalar = varianteInstalar({ ios: datos?.ios ?? false, hayPromptNativo: hayPrompt })
  const fase: FaseInstalar = instalada || aceptada ? 'lista' : esperando ? 'instalando' : 'ofrecer'

  async function instalar() {
    // Ocupado: el botón queda con aria-disabled (no disabled) para no perder el foco del teclado.
    if (esperando) return
    if (variante !== 'nativa') {
      setPasosAbiertos((abiertos) => !abiertos)
      return
    }
    setEsperando(true)
    const resultado = await pedirInstalacion()
    setEsperando(false)
    if (resultado === 'aceptada') setAceptada(true)
    // Si el navegador ya no deja mostrar su diálogo, quedan las instrucciones del menú.
    else if (resultado === 'no-disponible') setPasosAbiertos(true)
  }

  return { aparato: datos, variante, fase, pasosAbiertos, instalar }
}

/**
 * Chrome en Android sabe si la app ya está instalada (aunque se haya instalado desde el menú). Si
 * lo está, se anota en el dispositivo: la próxima carga el script de <head> ya no pinta la franja
 * (sin eso aparecería y se iría en cada carga).
 */
export function useInstaladaSegunNavegador(): boolean {
  const [instalada, setInstalada] = useState(false)
  useEffect(() => {
    let cancelado = false
    instaladaSegunNavegador().then((si) => {
      if (!si || cancelado) return
      try {
        window.localStorage.setItem(CLAVE_INSTALADA, '1')
      } catch {
        // Sin almacenamiento: esta vez se oculta igual.
      }
      setInstalada(true)
    })
    return () => {
      cancelado = true
    }
  }, [])
  return instalada
}

/** El texto del botón según lo que va a pasar al tocarlo. */
export function textoBotonInstalar(variante: VarianteInstalar, pasosAbiertos: boolean, fase: FaseInstalar): string {
  if (fase === 'instalando') return 'Instalando…'
  if (variante === 'nativa') return 'Instalar'
  return pasosAbiertos ? 'Ocultar los pasos' : 'Instalar'
}

/**
 * Un teléfono dibujado con la barra donde está Compartir: abajo (iPhone con Safari) o arriba (iPad y
 * los demás navegadores). Acompaña al texto, que dice lo mismo: el dibujo nunca va solo.
 */
function DibujoCompartir({ arriba }: { arriba: boolean }) {
  const barraY = arriba ? 6 : 42
  return (
    <svg className="dibujo-telefono" viewBox="0 0 40 62" aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="36" height="58" rx="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect className="dibujo-barra" x="5" y={barraY} width="30" height="14" rx="3.5" />
      <g
        transform={`translate(${arriba ? 20 : 13} ${barraY + 0.6}) scale(0.54)`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v12M8 7l4-4 4 4" />
        <path d="M8.5 10H6.5a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5h-2" />
      </g>
    </svg>
  )
}

/** Los pasos para instalar a mano: tres dibujados en iPhone/iPad; en los demás, el menú del navegador. */
export function PasosInstalar({ id, variante, navegador }: { id: string; variante: VarianteInstalar; navegador: NavegadorIOS }) {
  if (variante === 'generica') {
    return (
      <div id={id} className="pasos-instalar">
        <p className="paso-generico">{PASOS_GENERICOS}</p>
      </div>
    )
  }
  if (variante !== 'ios') return null

  const pasos = pasosIOS(navegador)
  const dibujos = [
    <DibujoCompartir key="compartir" arriba={!(navegador.aparato === 'iphone' && navegador.safari)} />,
    <Icono key="agregar" nombre="agregarInicio" className="dibujo-icono" />,
    <Icono key="app" nombre="iconoApp" className="dibujo-icono" />,
  ]
  const iconosTitulo = [<Icono key="c" nombre="compartir" />, <Icono key="a" nombre="agregarInicio" />, null]
  return (
    <div id={id} className="pasos-instalar">
      {/* role="list": con list-style none, VoiceOver deja de anunciar la lista. */}
      <ol role="list" className="lista-pasos">
        {pasos.map((paso, i) => (
          <li key={paso.titulo} className="paso-instalar">
            <span className="paso-dibujo" aria-hidden="true">
              {dibujos[i]}
            </span>
            <div className="paso-texto">
              <div className="paso-titulo">
                <span className="paso-numero">{i + 1}</span>
                <span>
                  {paso.titulo}
                  {iconosTitulo[i] && <span className="paso-icono-titulo"> {iconosTitulo[i]}</span>}
                </span>
              </div>
              <div className="hint">{paso.detalle}</div>
            </div>
          </li>
        ))}
      </ol>
      <p className="hint paso-requisito">{REQUISITO_IOS}</p>
    </div>
  )
}

/**
 * Ajustes → Notificaciones: "Instalar la app", para quien tocó "Ahora no" en la franja. Solo en
 * teléfono o tablet; ya instalada, lo dice. Se pinta después de hidratar (no está arriba de la
 * pantalla: no hay salto a la vista).
 */
export function TarjetaInstalar() {
  const { aparato: datos, variante, fase, pasosAbiertos, instalar } = useInstalar()
  const segunNavegador = useInstaladaSegunNavegador()
  const idPasos = useId()
  const [tocada, setTocada] = useState(false)
  const refEstado = useRef<HTMLParagraphElement>(null)

  // Instalada desde acá: el botón tocado desaparece y el foco pasa al texto que lo reemplaza.
  useEffect(() => {
    if (tocada && fase === 'lista') refEstado.current?.focus({ preventScroll: true })
  }, [tocada, fase])

  if (!datos?.movil) return null

  const instaladaAca = datos.standalone || datos.instaladaAntes || segunNavegador || fase === 'lista'
  return (
    <div className="card tarjeta-instalar">
      <div className="section-title">Instalar la app</div>
      {instaladaAca ? (
        <p ref={refEstado} tabIndex={-1} className="estado-instalada" aria-live="polite">
          <Icono nombre="si" />
          <span>
            {datos.standalone
              ? 'Estás usando la app instalada en este aparato.'
              : 'Ya está instalada. Abrila desde su ícono en la pantalla de inicio.'}
          </span>
        </p>
      ) : (
        <>
          <p className="hint tarjeta-instalar-texto">Queda como una app, con su ícono, y te llegan los avisos.</p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setTocada(true)
              instalar()
            }}
            aria-disabled={fase === 'instalando'}
            aria-busy={fase === 'instalando'}
            aria-expanded={variante === 'nativa' ? undefined : pasosAbiertos}
            aria-controls={variante === 'nativa' || !pasosAbiertos ? undefined : idPasos}
          >
            <Icono nombre="instalar" />
            {textoBotonInstalar(variante, pasosAbiertos, fase)}
          </button>
          {pasosAbiertos && <PasosInstalar id={idPasos} variante={variante} navegador={datos.navegador} />}
        </>
      )}
    </div>
  )
}
