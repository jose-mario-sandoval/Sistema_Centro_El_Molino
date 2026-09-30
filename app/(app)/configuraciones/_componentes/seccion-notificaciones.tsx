'use client'

import { useState, useTransition } from 'react'
import { TarjetaInstalar } from '@/components/app/instalar'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import type { Rol } from '@/lib/perfiles/roles'
import { descripcionAvisos, opcionesAvisos } from '@/lib/push/preferencias'
import type { PreferenciasAvisos } from '@/lib/validacion/push'
import { actualizarPreferenciasAvisos } from '../acciones-notificaciones'
import { DispositivoPush } from './dispositivo-push'

type Preferencias = Required<PreferenciasAvisos>

/** Sección "Notificaciones" (spec §8.2): este dispositivo y preferencias de la cuenta, según el rol. */
export function SeccionNotificaciones({ preferencias: iniciales, rol }: { preferencias: Preferencias; rol: Rol }) {
  const aviso = useAviso()
  const [preferencias, setPreferencias] = useState<Preferencias>(iniciales)
  const [guardando, iniciarGuardado] = useTransition()

  function cambiar(cambio: Partial<Preferencias>) {
    const anteriores = preferencias
    const nuevas = { ...preferencias, ...cambio }
    setPreferencias(nuevas)
    iniciarGuardado(async () => {
      const resultado = await llamarAccion(() => actualizarPreferenciasAvisos(nuevas))
      if (resultado.ok) {
        aviso('Preferencias guardadas')
      } else {
        setPreferencias(anteriores)
        aviso(resultado.error)
      }
    })
  }

  return (
    <section className="settings-section" aria-labelledby="titulo-notificaciones">
      <h2 id="titulo-notificaciones">Notificaciones</h2>
      {/* Cada rol ve solo lo que recibe: Administración no tiene recordatorios ni comidas propias. */}
      <div className="desc">{descripcionAvisos(rol)}</div>

      {/* Para quien tocó "Ahora no" en la franja de arriba. Solo en teléfono o tablet. */}
      <TarjetaInstalar />

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="section-title">Notificaciones en este dispositivo</div>
        <DispositivoPush />
      </div>

      <div className="card">
        <div className="section-title">Qué avisos recibir</div>

        {opcionesAvisos(rol).map((opcion) => (
          <div className="opcion-aviso" key={opcion.clave}>
            <input
              id={opcion.id}
              type="checkbox"
              checked={preferencias[opcion.clave]}
              disabled={guardando}
              onChange={(e) => cambiar({ [opcion.clave]: e.target.checked })}
              aria-describedby={`${opcion.id}-ayuda`}
            />
            <div>
              <label htmlFor={opcion.id}>{opcion.etiqueta}</label>
              <div id={`${opcion.id}-ayuda`} className="hint">
                {opcion.ayuda}
              </div>
            </div>
          </div>
        ))}

        <div className="hint" style={{ marginTop: 12 }}>
          Estas preferencias valen para todos tus dispositivos.
        </div>
      </div>
    </section>
  )
}
