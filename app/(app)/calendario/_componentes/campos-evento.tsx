'use client'

import { Fragment, useId } from 'react'
import { Icono, type NombreIcono } from '@/components/ui/iconos'
import {
  AYUDA_REQUERIMIENTO,
  ETIQUETA_REQUERIMIENTO,
  ETIQUETA_TIPO,
  alternarRequerimiento,
  REQUERIMIENTOS_COCINA,
  TIPOS_EVENTO,
  type RequerimientoCocina,
  type TipoEvento,
} from '@/lib/calendario/tipos'

const ICONO: Record<RequerimientoCocina, NombreIcono> = { merienda: 'merienda', comida: 'comidas', materiales: 'materiales' }

function ErrorCampo({ mensaje }: { mensaje?: string }) {
  return mensaje ? <div className="campo-error">{mensaje}</div> : null
}

/**
 * Tipo del evento y lo que le pide a la cocina. Son controles reales (radios y casillas) con aspecto
 * de botones grandes: se usan con teclado y lector de pantalla igual que los nativos.
 * Controlados, como el resto del formulario: React 19 reinicia los campos no controlados al terminar
 * la acción, y tras un error se perdería lo marcado.
 */
export function CamposTipoYCocina({
  tipo,
  alCambiarTipo,
  requiere,
  alCambiarRequiere,
  otroTexto,
  alCambiarOtroTexto,
  errorTipo,
  errorCocina,
  errorOtroTexto,
}: {
  tipo: TipoEvento | ''
  alCambiarTipo: (tipo: TipoEvento) => void
  requiere: readonly RequerimientoCocina[]
  alCambiarRequiere: (requiere: RequerimientoCocina[]) => void
  otroTexto: string
  alCambiarOtroTexto: (texto: string) => void
  errorTipo?: string
  errorCocina?: string
  errorOtroTexto?: string
}) {
  const id = useId()

  return (
    <>
      <fieldset className="grupo-campo">
        <legend>Tipo de evento</legend>
        <div className="opciones-pastilla">
          {TIPOS_EVENTO.map((t) => (
            <label key={t} className="opcion-pastilla">
              <input
                type="radio"
                name="tipo"
                value={t}
                checked={tipo === t}
                onChange={() => alCambiarTipo(t)}
                required
              />
              <span>{ETIQUETA_TIPO[t]}</span>
            </label>
          ))}
        </div>
        <ErrorCampo mensaje={errorTipo} />
      </fieldset>

      <fieldset className="grupo-campo" aria-describedby={`${id}-ayuda`}>
        <legend>¿Necesita algo de la cocina?</legend>
        <div className="hint" id={`${id}-ayuda`}>
          Si marcás algo, la cocina verá el día y la hora, pero no de qué es el evento.
        </div>
        <div className="opciones-pastilla">
          {REQUERIMIENTOS_COCINA.map((r) => (
            <Fragment key={r}>
              <label className="opcion-pastilla con-icono">
                <input
                  type="checkbox"
                  name="requiere_cocina"
                  value={r}
                  checked={requiere.includes(r)}
                  onChange={() => alCambiarRequiere(alternarRequerimiento(requiere, r))}
                  aria-describedby={`${id}-${r}`}
                />
                <span>
                  <Icono nombre={ICONO[r]} />
                  {ETIQUETA_REQUERIMIENTO[r]}
                </span>
              </label>
              {/* Fuera de la etiqueta: así no forma parte del nombre de la casilla, solo de su descripción. */}
              <span className="sr-only" id={`${id}-${r}`}>
                {AYUDA_REQUERIMIENTO[r]}
              </span>
            </Fragment>
          ))}
        </div>
        <ErrorCampo mensaje={errorCocina} />
      </fieldset>

      <div className="field">
        <label htmlFor={`${id}-otro-texto`}>Otro pedido para Administración (opcional)</label>
        <input
          id={`${id}-otro-texto`}
          name="requiere_otro_texto"
          placeholder="Ej. 20 sillas extra"
          maxLength={200}
          value={otroTexto}
          onChange={(e) => alCambiarOtroTexto(e.target.value)}
        />
        <ErrorCampo mensaje={errorOtroTexto} />
      </div>
    </>
  )
}
