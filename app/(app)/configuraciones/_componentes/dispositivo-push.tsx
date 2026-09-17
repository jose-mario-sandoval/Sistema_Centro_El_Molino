'use client'

import { useEffect, useState } from 'react'
import { useAviso } from '@/components/ui/avisos'
import {
  activarEsteDispositivo,
  desactivarEsteDispositivo,
  revisarEsteDispositivo,
  type EstadoDispositivo,
} from '@/lib/push/cliente'

const LLAVE_PUBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

const TEXTO_ESTADO: Record<EstadoDispositivo | 'revisando', string> = {
  revisando: 'Revisando este dispositivo…',
  'sin-llave': 'Las notificaciones todavía no están configuradas en el servidor.',
  'ios-instalar': 'En iPhone y iPad, las notificaciones funcionan solo con la app agregada a la pantalla de inicio.',
  'sin-soporte': 'Este navegador no permite notificaciones push. Probá con Chrome, Edge, Firefox o Safari actualizados.',
  bloqueado: 'Las notificaciones están bloqueadas para esta app. Habilitalas en los ajustes del navegador y recargá la página.',
  inactivo: 'Las notificaciones están desactivadas en este dispositivo.',
  activo: 'Las notificaciones están activadas en este dispositivo.',
}

/** "Notificaciones en este dispositivo" (spec §8.2). */
export function DispositivoPush() {
  const aviso = useAviso()
  const [estado, setEstado] = useState<EstadoDispositivo | 'revisando'>('revisando')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let cancelado = false
    revisarEsteDispositivo(LLAVE_PUBLICA).then((nuevo) => {
      if (!cancelado) setEstado(nuevo)
    })
    return () => {
      cancelado = true
    }
  }, [])

  async function activar() {
    setOcupado(true)
    // activarEsteDispositivo pide el permiso antes de cualquier otra espera (gesto del usuario en iOS).
    const resultado = await activarEsteDispositivo(LLAVE_PUBLICA)
    if (resultado.ok) {
      setEstado('activo')
      aviso('Notificaciones activadas en este dispositivo')
    } else {
      aviso(resultado.error)
      setEstado(await revisarEsteDispositivo(LLAVE_PUBLICA))
    }
    setOcupado(false)
  }

  async function desactivar() {
    setOcupado(true)
    const resultado = await desactivarEsteDispositivo()
    if (resultado.ok) {
      setEstado('inactivo')
      aviso('Notificaciones desactivadas en este dispositivo')
    } else {
      aviso(resultado.error)
    }
    setOcupado(false)
  }

  return (
    <div>
      <p className="estado-push" aria-live="polite">
        {TEXTO_ESTADO[estado]}
      </p>

      {estado === 'ios-instalar' && (
        <div className="locked-banner" role="note">
          <div>
            Para activarlas:
            <ol className="pasos-ios">
              <li>En Safari, tocá el botón Compartir (el cuadrado con la flecha hacia arriba).</li>
              <li>Elegí “Agregar a pantalla de inicio”.</li>
              <li>Abrí la app desde el ícono nuevo, iniciá sesión y volvé a esta sección.</li>
            </ol>
            <div className="hint">Requiere iOS 16.4 o posterior.</div>
          </div>
        </div>
      )}

      {estado === 'inactivo' && (
        <button type="button" className="btn" onClick={activar} disabled={ocupado} aria-busy={ocupado}>
          {ocupado ? 'Activando…' : 'Activar notificaciones'}
        </button>
      )}

      {estado === 'activo' && (
        <button type="button" className="btn ghost" onClick={desactivar} disabled={ocupado} aria-busy={ocupado}>
          {ocupado ? 'Desactivando…' : 'Desactivar en este dispositivo'}
        </button>
      )}
    </div>
  )
}
