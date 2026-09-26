'use client'

import { useActionState, useId, useRef, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { Icono } from '@/components/ui/iconos'
import { MiniCalendario } from '@/components/ui/mini-calendario'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import type { Ausencia } from '@/lib/ausencias/tipos'
import {
  SIN_SELECCION,
  errorSeleccion,
  limitesAusencia,
  resumenSeleccion,
  tocarDia,
  type SeleccionRango,
} from '@/lib/calendario/seleccion-rango'
import type { FechaISO } from '@/lib/fechas'
import { rangoLegible } from '@/lib/fechas/rango'
import { marcarAusencia, quitarAusencia } from '../acciones-ausencias'

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

/**
 * Marcar una ausencia tocando el primer y el último día en el mini calendario. La acción recibe los
 * mismos campos `desde`/`hasta` que antes, ahora ocultos: un solo día es desde = hasta.
 */
function FormularioAusencia({
  id,
  hoy,
  ausencias,
  alCerrar,
}: {
  id: string
  hoy: FechaISO
  ausencias: Ausencia[]
  alCerrar: () => void
}) {
  const aviso = useAviso()
  const [seleccion, setSeleccion] = useState<SeleccionRango>(SIN_SELECCION)
  // El error de las fechas que devuelve el servidor vale para lo que se envió: al tocar otro día se va.
  const [errorServidor, setErrorServidor] = useState<string | null>(null)
  const { min, max } = limitesAusencia(hoy)
  const [, accion] = useActionState(
    async (previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null> | null> => {
      let resultado: Resultado<null>
      try {
        resultado = await marcarAusencia(previo, formData)
      } catch {
        resultado = fallo('No se pudo guardar la ausencia. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) {
        aviso('Ausencia marcada. Tus comidas de esos días quedan canceladas.')
        alCerrar()
      } else if (resultado.campos) {
        setErrorServidor(resultado.campos.desde ?? resultado.campos.hasta ?? resultado.error)
      } else {
        aviso(resultado.error)
      }
      return resultado
    },
    null,
  )
  const errorLocal = errorSeleccion(seleccion)
  const error = errorLocal ?? errorServidor

  return (
    <form
      id={id}
      action={accion}
      className="formulario-ausencia"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          alCerrar()
        }
      }}
    >
      <p className="hint">Tocá el primer día y el último día que no vas a estar. Si es uno solo, tocalo una vez.</p>
      <MiniCalendario
        hoy={hoy}
        min={min}
        max={max}
        ausencias={ausencias}
        seleccion={seleccion}
        alTocar={(fecha) => {
          setSeleccion((actual) => tocarDia(actual, fecha))
          setErrorServidor(null)
        }}
      />
      {/* Lo elegido, escrito, antes de guardar: el día se toca en ~39px, así que se confirma leyendo. */}
      <div className="resumen-ausencia" aria-live="polite">
        <p className="resumen-ausencia-texto">{resumenSeleccion(seleccion)}</p>
        {error && <p className="campo-error">{error}</p>}
      </div>
      <input type="hidden" name="desde" value={seleccion.desde ?? ''} />
      <input type="hidden" name="hasta" value={seleccion.hasta ?? seleccion.desde ?? ''} />
      <div className="acciones-formulario">
        <BotonEnvio textoPendiente="Guardando…" deshabilitado={seleccion.desde === null || errorLocal !== null}>
          Guardar ausencia
        </BotonEnvio>
        <button type="button" className="btn ghost" onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

/**
 * Ausencias de la propia persona (Director y Residente), en una tarjeta compacta debajo del
 * calendario. Sus comidas de esos días se cancelan solas; son privadas: la cocina ve "No comer", no
 * el motivo ni las fechas.
 */
export function PanelAusencias({ ausencias, hoy }: { ausencias: Ausencia[]; hoy: FechaISO }) {
  const [abierto, setAbierto] = useState(false)
  const idFormulario = useId()
  const boton = useRef<HTMLButtonElement>(null)

  function cerrar() {
    setAbierto(false)
    boton.current?.focus()
  }

  return (
    <section className="card panel-ausencias" aria-labelledby="titulo-ausencias">
      <h2 id="titulo-ausencias" className="section-title">
        Mis ausencias
      </h2>
      <p className="hint">
        Los días que no vas a estar, tus comidas se cancelan solas. Si volvés antes, podés pedir una comida desde
        Comidas. Solo vos ves estas fechas.
      </p>
      {ausencias.length === 0 ? (
        <p className="ausencias-vacio">No tenés ausencias marcadas.</p>
      ) : (
        <ul className="lista-ausencias">
          {ausencias.map((ausencia) => (
            <FilaAusencia key={ausencia.id} ausencia={ausencia} />
          ))}
        </ul>
      )}
      <button
        ref={boton}
        type="button"
        className="btn ghost boton-marcar-ausencia"
        aria-expanded={abierto}
        aria-controls={abierto ? idFormulario : undefined}
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
      >
        Marcar una ausencia
        <Icono nombre="abajo" className="flecha" />
      </button>
      {abierto && <FormularioAusencia id={idFormulario} hoy={hoy} ausencias={ausencias} alCerrar={cerrar} />}
    </section>
  )
}
