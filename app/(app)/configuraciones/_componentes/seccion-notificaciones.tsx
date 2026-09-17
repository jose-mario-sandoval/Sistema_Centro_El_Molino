'use client'

import { useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import { actualizarPreferenciasAvisos } from '../acciones-notificaciones'
import { DispositivoPush } from './dispositivo-push'

type Preferencias = { avisarHoraLimite: boolean; avisarMensajes: boolean }

/** Sección "Notificaciones" (spec §8.2): este dispositivo y preferencias de la cuenta. */
export function SeccionNotificaciones({
  avisarHoraLimite,
  avisarMensajes,
  conComidas,
}: Preferencias & { conComidas: boolean }) {
  const aviso = useAviso()
  const [preferencias, setPreferencias] = useState<Preferencias>({ avisarHoraLimite, avisarMensajes })
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
      {/* Administración no recibe recordatorios de hora límite (spec §8.2): no se los menciona. */}
      <div className="desc">
        {conComidas
          ? 'Avisos de mensajes nuevos y recordatorios antes de la hora límite.'
          : 'Avisos de mensajes nuevos.'}
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="section-title">Notificaciones en este dispositivo</div>
        <DispositivoPush />
      </div>

      <div className="card">
        <div className="section-title">Qué avisos recibir</div>

        <div className="opcion-aviso">
          <input
            id="avisar-mensajes"
            type="checkbox"
            checked={preferencias.avisarMensajes}
            disabled={guardando}
            onChange={(e) => cambiar({ avisarMensajes: e.target.checked })}
            aria-describedby="avisar-mensajes-ayuda"
          />
          <div>
            <label htmlFor="avisar-mensajes">Mensajes nuevos</label>
            <div id="avisar-mensajes-ayuda" className="hint">
              Publicaciones nuevas y respuestas en hilos donde participás.
            </div>
          </div>
        </div>

        {conComidas && (
          <div className="opcion-aviso">
            <input
              id="avisar-hora-limite"
              type="checkbox"
              checked={preferencias.avisarHoraLimite}
              disabled={guardando}
              onChange={(e) => cambiar({ avisarHoraLimite: e.target.checked })}
              aria-describedby="avisar-hora-limite-ayuda"
            />
            <div>
              <label htmlFor="avisar-hora-limite">Recordatorio de hora límite</label>
              <div id="avisar-hora-limite-ayuda" className="hint">
                Una hora antes de que cierre una comida que todavía está sin definir.
              </div>
            </div>
          </div>
        )}

        <div className="hint" style={{ marginTop: 12 }}>
          Estas preferencias valen para todos tus dispositivos.
        </div>
      </div>
    </section>
  )
}
