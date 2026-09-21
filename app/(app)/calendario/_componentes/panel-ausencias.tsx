'use client'

import { useActionState, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { Icono } from '@/components/ui/iconos'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import type { Ausencia } from '@/lib/ausencias/tipos'
import { FECHA_MAXIMA } from '@/lib/calendario/cuadricula'
import type { FechaISO } from '@/lib/fechas'
import { rangoLegible } from '@/lib/fechas/rango'
import { marcarAusencia, quitarAusencia } from '../acciones-ausencias'

function ErrorCampo({ mensaje }: { mensaje?: string }) {
  return mensaje ? <div className="campo-error">{mensaje}</div> : null
}

function FilaAusencia({ ausencia }: { ausencia: Ausencia }) {
  const aviso = useAviso()
  const [confirmando, setConfirmando] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const rango = rangoLegible(ausencia.desde, ausencia.hasta)

  function quitar() {
    iniciar(async () => {
      let resultado: Resultado<null>
      try {
        resultado = await quitarAusencia({ id: ausencia.id })
      } catch {
        resultado = fallo('No se pudo quitar la ausencia. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) aviso('Ausencia quitada. Tus comidas vuelven a tu plan.')
      else {
        aviso(resultado.error)
        setConfirmando(false)
      }
    })
  }

  return (
    <li className="fila-ausencia">
      <span className="ausencia-rango">
        <Icono nombre="ausencia" />
        {rango}
      </span>
      {confirmando ? (
        <span className="ausencia-acciones">
          <button type="button" className="btn danger small" onClick={quitar} disabled={pendiente}>
            {pendiente ? 'Quitando…' : 'Sí, quitar'}
          </button>
          {/* Al pedir confirmación el foco va a la opción segura. */}
          <button type="button" className="btn ghost small" onClick={() => setConfirmando(false)} disabled={pendiente} autoFocus>
            Cancelar
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="btn ghost small"
          onClick={() => setConfirmando(true)}
          aria-label={`Quitar la ausencia del ${rango}`}
        >
          Quitar
        </button>
      )}
    </li>
  )
}

function FormularioAusencia({ hoy }: { hoy: FechaISO }) {
  const aviso = useAviso()
  // Controlados: React 19 reinicia los campos no controlados al terminar la acción, y tras un error
  // la persona perdería las fechas que eligió (mismo patrón que el resto de los formularios).
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [estado, accion] = useActionState(
    async (previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null> | null> => {
      let resultado: Resultado<null>
      try {
        resultado = await marcarAusencia(previo, formData)
      } catch {
        resultado = fallo('No se pudo guardar la ausencia. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) {
        aviso('Ausencia marcada. Tus comidas de esos días quedan canceladas.')
        setDesde('')
        setHasta('')
      } else if (!resultado.campos) {
        aviso(resultado.error)
      }
      return resultado
    },
    null,
  )
  const campos = estado && !estado.ok ? estado.campos : undefined

  return (
    <form action={accion} className="formulario-ausencia">
      <div className="section-title">Marcar una ausencia</div>
      <div className="field">
        <label htmlFor="ausencia-desde">Primer día que no voy a estar</label>
        <input
          id="ausencia-desde"
          name="desde"
          type="date"
          min={hoy}
          max={FECHA_MAXIMA}
          required
          value={desde}
          onChange={(e) => {
            setDesde(e.target.value)
            // Un solo día: con elegir el primero alcanza. Se ofrece el mismo como último, editable.
            if (hasta === '' || hasta < e.target.value) setHasta(e.target.value)
          }}
        />
        <ErrorCampo mensaje={campos?.desde} />
      </div>
      <div className="field">
        <label htmlFor="ausencia-hasta">Último día que no voy a estar</label>
        <input
          id="ausencia-hasta"
          name="hasta"
          type="date"
          min={desde || hoy}
          max={FECHA_MAXIMA}
          required
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
        />
        <ErrorCampo mensaje={campos?.hasta} />
      </div>
      <BotonEnvio textoPendiente="Guardando…">Marcar ausencia</BotonEnvio>
    </form>
  )
}

/**
 * Ausencias de la propia persona (Director y Residente). Sus comidas de esos días se cancelan solas;
 * son privadas: la cocina ve "No comer", no el motivo ni las fechas.
 */
export function PanelAusencias({ ausencias, hoy }: { ausencias: Ausencia[]; hoy: FechaISO }) {
  return (
    <section className="card panel-ausencias" aria-labelledby="titulo-ausencias">
      <h2 id="titulo-ausencias" className="section-title">
        Mis ausencias
      </h2>
      <p className="hint">
        Marcá los días que no vas a estar. Tus comidas de esos días se cancelan solas. Si volvés antes, podés volver a
        pedir una comida desde Comidas. Solo vos ves estas fechas.
      </p>
      {ausencias.length === 0 ? (
        <div className="empty-state">No tenés ausencias marcadas.</div>
      ) : (
        <ul className="lista-ausencias">
          {ausencias.map((ausencia) => (
            <FilaAusencia key={ausencia.id} ausencia={ausencia} />
          ))}
        </ul>
      )}
      <FormularioAusencia hoy={hoy} />
    </section>
  )
}
