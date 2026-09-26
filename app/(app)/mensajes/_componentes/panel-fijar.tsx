'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { fechaISOEn } from '@/lib/fechas'
import { DURACIONES_FIJADO, ETIQUETA_DURACION, type DuracionFijado } from '@/lib/mensajes/fijados'
import type { AlFijar } from './tarjeta-mensaje'

/**
 * Por cuánto tiempo fijar una publicación arriba. En línea, debajo de los botones de la tarjeta (DESIGN.md
 * §8: sin modales). Bandeja hundida con opciones en pastilla, igual que los radios de los formularios.
 */
export function PanelFijar({
  id,
  mensajeId,
  ahora,
  alFijar,
  alCancelar,
}: {
  id: string
  mensajeId: string
  ahora: Date
  alFijar: AlFijar
  alCancelar: () => void
}) {
  const [duracion, setDuracion] = useState<DuracionFijado>('siempre')
  const [fecha, setFecha] = useState('')
  const [errorFecha, setErrorFecha] = useState<string | null>(null)
  const [pendiente, iniciar] = useTransition()
  const primeraOpcion = useRef<HTMLInputElement>(null)
  const hoy = fechaISOEn(ahora)

  // Al abrir, el foco pasa a la primera opción (sin teclado en el teléfono: es un radio, no un campo de texto).
  useEffect(() => {
    primeraOpcion.current?.focus()
  }, [])

  function fijar() {
    if (pendiente) return
    if (duracion === 'fecha' && !fecha) {
      setErrorFecha('Elegí hasta qué día.')
      return
    }
    setErrorFecha(null)
    iniciar(async () => {
      const resultado = await alFijar(mensajeId, duracion, duracion === 'fecha' ? fecha : undefined)
      if (!resultado.ok && resultado.campos?.fecha) setErrorFecha(resultado.campos.fecha)
    })
  }

  return (
    <form
      id={id}
      className="panel-fijar"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        fijar()
      }}
    >
      <fieldset className="grupo-campo">
        <legend>¿Por cuánto tiempo la fijás arriba?</legend>
        <div className="opciones-pastilla">
          {DURACIONES_FIJADO.map((d, i) => (
            <label key={d} className="opcion-pastilla">
              <input
                ref={i === 0 ? primeraOpcion : undefined}
                type="radio"
                name={`duracion-${mensajeId}`}
                value={d}
                checked={duracion === d}
                onChange={() => setDuracion(d)}
              />
              <span>{ETIQUETA_DURACION[d]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {duracion === 'fecha' && (
        <div className="field">
          <label htmlFor={`${id}-fecha`}>Hasta el día (incluido)</label>
          <input
            id={`${id}-fecha`}
            type="date"
            min={hoy}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            aria-invalid={errorFecha ? true : undefined}
            aria-describedby={errorFecha ? `${id}-error` : undefined}
          />
          {errorFecha && (
            <div className="campo-error" id={`${id}-error`}>
              {errorFecha}
            </div>
          )}
        </div>
      )}

      <div className="acciones-formulario">
        <button type="submit" className="btn small" aria-disabled={pendiente} aria-busy={pendiente}>
          {pendiente ? 'Fijando…' : 'Fijar arriba'}
        </button>
        <button type="button" className="btn ghost small" onClick={alCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
