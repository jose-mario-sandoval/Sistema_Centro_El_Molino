'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { PasosInstalar, textoBotonInstalar, useInstaladaSegunNavegador, useInstalar } from '@/components/app/instalar'
import { useAviso } from '@/components/ui/avisos'
import { Icono } from '@/components/ui/iconos'
import { CLAVE_AVISOS_DESCARTADOS, CLAVE_INSTALAR_DESCARTADA } from '@/lib/pwa/instalar'
import { activarEsteDispositivo } from '@/lib/push/cliente'

/*
 * Las dos invitaciones de arriba de la app (plan 2026-09-29), en teléfono o tablet:
 * - en el navegador, "Instalá El Molino en tu teléfono";
 * - en la app instalada, "Activá los avisos en este teléfono".
 * El HTML es siempre el mismo y el CSS lo muestra solo si el script de <head> puso
 * `data-instalar="ofrecer"` / `data-ofrecer-avisos="si"` en <html>: se ve desde el primer pintado,
 * sin saltos y sin diferencias con el servidor. Cerrarlas quita ese atributo.
 */

const LLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

function anotarAhora(clave: string) {
  try {
    window.localStorage.setItem(clave, String(Date.now()))
  } catch {
    // Sin almacenamiento (navegación privada): se oculta igual, hasta la próxima carga.
  }
}

function quitarAtributo(atributo: 'data-instalar' | 'data-ofrecer-avisos') {
  document.documentElement.removeAttribute(atributo)
}

/**
 * Al cerrar la franja, el foco pasa al título de la página (el botón tocado ya no existe): el lector
 * de pantalla anuncia dónde quedó la persona, como al cambiar de sección (DESIGN.md §7).
 */
function enfocarContenido() {
  const destino = document.querySelector<HTMLElement>('main h1') ?? document.querySelector<HTMLElement>('main')
  if (!destino) return
  if (!destino.hasAttribute('tabindex')) destino.tabIndex = -1
  destino.focus({ preventScroll: true })
}

type Aparato = 'teléfono' | 'tablet'

/** "Instalá El Molino en tu teléfono", arriba del contenido, hasta que la instale o toque "Ahora no". */
export function InvitacionInstalar({ enEste }: { enEste: Aparato }) {
  const aviso = useAviso()
  const { aparato, variante, fase, pasosAbiertos, instalar } = useInstalar()
  const yaInstalada = useInstaladaSegunNavegador()
  const [cerrada, setCerrada] = useState(false)
  const idTitulo = useId()
  const idPasos = useId()
  const refEntendido = useRef<HTMLButtonElement>(null)

  // Chrome en Android: si ya se instaló (por ejemplo, desde el menú), la franja no corresponde.
  useEffect(() => {
    if (yaInstalada && fase !== 'lista') quitarAtributo('data-instalar')
  }, [yaInstalada, fase])

  // Recién instalada: el foco va a "Entendido" (el botón "Instalar" ya no está).
  useEffect(() => {
    if (fase === 'lista') refEntendido.current?.focus()
  }, [fase])

  if (cerrada || (yaInstalada && fase !== 'lista')) return null

  function ahoraNo() {
    anotarAhora(CLAVE_INSTALAR_DESCARTADA)
    quitarAtributo('data-instalar')
    setCerrada(true)
    aviso('Te lo volvemos a ofrecer en una semana. También está en Ajustes.')
    enfocarContenido()
  }

  function entendido() {
    quitarAtributo('data-instalar')
    setCerrada(true)
    enfocarContenido()
  }

  if (fase === 'lista') {
    return (
      <section className="card invitacion invitacion-instalar invitacion-lista" role="region" aria-labelledby={idTitulo}>
        <div className="invitacion-cabeza">
          <span className="invitacion-icono" aria-hidden="true">
            <Icono nombre="si" />
          </span>
          <div role="status">
            <p id={idTitulo} className="invitacion-titulo">
              Listo: la app quedó instalada
            </p>
            <p className="invitacion-texto">Abrila desde su ícono en la pantalla de inicio. Ahí te ofrece activar los avisos.</p>
          </div>
        </div>
        <div className="invitacion-acciones">
          <button ref={refEntendido} type="button" className="btn" onClick={entendido}>
            Entendido
          </button>
        </div>
      </section>
    )
  }

  const abiertos = pasosAbiertos && variante !== 'nativa'
  return (
    <section className="card invitacion invitacion-instalar" role="region" aria-labelledby={idTitulo}>
      <div className="invitacion-cabeza">
        <span className="invitacion-icono" aria-hidden="true">
          <Icono nombre="instalar" />
        </span>
        <div>
          <p id={idTitulo} className="invitacion-titulo">
            Instalá El Molino en tu {enEste}
          </p>
          <p className="invitacion-texto">Queda como una app, con su ícono, y te llegan los avisos.</p>
        </div>
      </div>
      <div className="invitacion-acciones">
        <button
          type="button"
          className="btn"
          onClick={instalar}
          aria-disabled={fase === 'instalando'}
          aria-busy={fase === 'instalando'}
          aria-expanded={variante === 'nativa' ? undefined : abiertos}
          aria-controls={abiertos ? idPasos : undefined}
        >
          <Icono nombre="instalar" />
          {textoBotonInstalar(variante, abiertos, fase)}
        </button>
        <button type="button" className="btn ghost" onClick={ahoraNo}>
          Ahora no
        </button>
      </div>
      {abiertos && aparato && <PasosInstalar id={idPasos} variante={variante} navegador={aparato.navegador} />}
    </section>
  )
}

type FaseAvisos = 'ofrecer' | 'activando' | 'listo' | 'error' | 'bloqueado'

/**
 * Ya instalada: "Activá los avisos en este teléfono", con el mismo flujo que Ajustes
 * (activarEsteDispositivo). El permiso se pide solo al tocar "Activar avisos".
 */
export function OfrecerAvisos({ enEste, texto }: { enEste: Aparato; texto: string }) {
  const aviso = useAviso()
  const [fase, setFase] = useState<FaseAvisos>('ofrecer')
  const [error, setError] = useState<string | null>(null)
  const [cerrada, setCerrada] = useState(false)
  const idTitulo = useId()
  const refCerrar = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (fase === 'listo' || fase === 'bloqueado') refCerrar.current?.focus()
  }, [fase])

  if (cerrada) return null

  async function activar() {
    if (fase === 'activando') return
    setFase('activando')
    setError(null)
    // Directo desde el toque: iOS exige el gesto para pedir el permiso.
    const resultado = await activarEsteDispositivo(LLAVE_PUBLICA)
    if (resultado.ok) {
      setFase('listo')
      return
    }
    setError(resultado.error)
    setFase(typeof Notification !== 'undefined' && Notification.permission === 'denied' ? 'bloqueado' : 'error')
  }

  function cerrar() {
    quitarAtributo('data-ofrecer-avisos')
    setCerrada(true)
    enfocarContenido()
  }

  function ahoraNo() {
    if (fase === 'activando') return
    anotarAhora(CLAVE_AVISOS_DESCARTADOS)
    aviso('Podés activarlos cuando quieras en Ajustes.')
    cerrar()
  }

  const listo = fase === 'listo'
  return (
    <section className="card invitacion invitacion-avisos" role="region" aria-labelledby={idTitulo}>
      <div className="invitacion-cabeza">
        <span className="invitacion-icono" aria-hidden="true">
          <Icono nombre={listo ? 'si' : 'campana'} />
        </span>
        <div role="status">
          <p id={idTitulo} className="invitacion-titulo">
            {listo ? `Listo: los avisos quedaron activados en este ${enEste}` : `Activá los avisos en este ${enEste}`}
          </p>
          <p className="invitacion-texto">{listo ? 'Los cambiás cuando quieras en Ajustes.' : texto}</p>
        </div>
      </div>
      {error && (
        <p className="invitacion-error" role="alert">
          {error}
        </p>
      )}
      <div className="invitacion-acciones">
        {listo || fase === 'bloqueado' ? (
          <button ref={refCerrar} type="button" className="btn" onClick={cerrar}>
            Entendido
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn"
              onClick={activar}
              aria-disabled={fase === 'activando'}
              aria-busy={fase === 'activando'}
            >
              <Icono nombre="campana" />
              {fase === 'activando' ? 'Activando…' : fase === 'error' ? 'Intentar de nuevo' : 'Activar avisos'}
            </button>
            <button type="button" className="btn ghost" onClick={ahoraNo} aria-disabled={fase === 'activando'}>
              Ahora no
            </button>
          </>
        )}
      </div>
    </section>
  )
}
