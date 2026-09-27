'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Icono } from '@/components/ui/iconos'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { ajustarCantidad, textoExtra } from '@/lib/comidas/casa'
import { etiquetaDia } from '@/lib/comidas/semana'
import {
  CANTIDAD_MAXIMA_EXTRA,
  ETIQUETA_TIEMPO,
  LARGO_MAXIMO_NOTA_EXTRA,
  TIEMPOS_COMIDA,
  type ExtraManual,
  type TiempoComida,
} from '@/lib/comidas/tipos'
import type { FechaISO } from '@/lib/fechas'
import { agregarExtra, quitarExtra } from '../acciones'

const AVISO_CERRADA = 'Esa comida ya cerró: la cocina puede no verlo a tiempo.'

/** Clave día + comida de `cerradas`. */
function clave(fecha: FechaISO, comida: TiempoComida): string {
  return `${fecha}|${comida}`
}

function FilaExtra({ extra, cerrada, alQuitar }: { extra: ExtraManual; cerrada: boolean; alQuitar: () => void }) {
  const aviso = useAviso()
  const [confirmando, setConfirmando] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const texto = textoExtra(extra)
  const botonQuitar = useRef<HTMLButtonElement>(null)
  const volverAQuitar = useRef(false)

  // Al cancelar (o si falla), los botones de confirmar desaparecen: el foco vuelve a "Quitar".
  useEffect(() => {
    if (confirmando || !volverAQuitar.current) return
    volverAQuitar.current = false
    botonQuitar.current?.focus()
  }, [confirmando])

  function dejarDeConfirmar() {
    volverAQuitar.current = true
    setConfirmando(false)
  }

  function quitar() {
    iniciar(async () => {
      let resultado: Resultado<null>
      try {
        resultado = await quitarExtra({ id: extra.id })
      } catch {
        resultado = fallo('No se pudo quitar el extra. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) {
        aviso('Extra quitado. La cocina ya no lo cuenta.')
        // La fila desaparece: el foco va al título de la lista, nunca a la nada.
        alQuitar()
      } else {
        aviso(resultado.error)
        dejarDeConfirmar()
      }
    })
  }

  return (
    <li className="fila-extra">
      <span className="extra-texto">
        <span className="extra-cuanto">{texto}</span>
        {extra.nota && <span className="extra-nota">Nota: {extra.nota}</span>}
      </span>
      {cerrada ? (
        // Después del cierre la cocina ya pudo contarlo: se ve, pero ya no se quita.
        <span className="etiqueta-cerrado">
          <Icono nombre="candado" />
          Cerrada
        </span>
      ) : confirmando ? (
        <span className="ausencia-acciones">
          <button type="button" className="btn danger small" onClick={quitar} disabled={pendiente}>
            {pendiente ? 'Quitando…' : 'Sí, quitar'}
          </button>
          {/* Al pedir confirmación el foco va a la opción segura. */}
          <button type="button" className="btn ghost small" onClick={dejarDeConfirmar} disabled={pendiente} autoFocus>
            Cancelar
          </button>
        </span>
      ) : (
        <button
          ref={botonQuitar}
          type="button"
          className="btn ghost small"
          onClick={() => setConfirmando(true)}
          aria-label={`Quitar el extra: ${texto}`}
        >
          Quitar
        </button>
      )}
    </li>
  )
}

function FormularioExtra({
  id,
  dias,
  cerradas,
  alCerrar,
}: {
  id: string
  dias: FechaISO[]
  cerradas: ReadonlySet<string>
  alCerrar: () => void
}) {
  const aviso = useAviso()
  const idCantidad = useId()
  const idNota = useId()
  const idAyudaNota = useId()
  const [fecha, setFecha] = useState<FechaISO>(dias[0])
  const [comida, setComida] = useState<TiempoComida | null>(null)
  const [cantidad, setCantidad] = useState('1')
  const [nota, setNota] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [pendiente, iniciar] = useTransition()

  const yaCerro = comida !== null && cerradas.has(clave(fecha, comida))

  function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (pendiente) return
    if (comida === null) {
      setErrores({ comida: 'Elegí la comida.' })
      return
    }
    iniciar(async () => {
      let resultado: Resultado<null>
      try {
        resultado = await agregarExtra({ fecha, comida, cantidad, nota })
      } catch {
        resultado = fallo('No se pudo agregar el extra. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) {
        aviso('Extra agregado. La cocina ya lo ve.')
        alCerrar()
      } else if (resultado.campos) {
        setErrores(resultado.campos)
      } else {
        aviso(resultado.error)
      }
    })
  }

  return (
    <form
      id={id}
      className="formulario-extra"
      noValidate
      onSubmit={enviar}
      aria-busy={pendiente || undefined}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          alCerrar()
        }
      }}
    >
      <fieldset className="grupo-campo">
        <legend>Día</legend>
        <div className="opciones-pastilla">
          {dias.map((d) => (
            <label key={d} className="opcion-pastilla">
              <input type="radio" name="fecha" value={d} checked={fecha === d} onChange={() => setFecha(d)} />
              <span>{etiquetaDia(d)}</span>
            </label>
          ))}
        </div>
        {errores.fecha && <p className="campo-error">{errores.fecha}</p>}
      </fieldset>

      <fieldset className="grupo-campo">
        <legend>Comida</legend>
        <div className="opciones-pastilla">
          {TIEMPOS_COMIDA.map((c) => (
            <label key={c} className="opcion-pastilla">
              <input
                type="radio"
                name="comida"
                value={c}
                checked={comida === c}
                onChange={() => {
                  setComida(c)
                  setErrores((antes) => {
                    const copia = { ...antes }
                    delete copia.comida
                    return copia
                  })
                }}
              />
              <span>{ETIQUETA_TIEMPO[c]}</span>
            </label>
          ))}
        </div>
        {errores.comida && <p className="campo-error">{errores.comida}</p>}
      </fieldset>

      {/* Antes de guardar: un extra de una comida que ya cerró se guarda igual (un invitado de último
          momento), pero la cocina puede haber cocinado ya. */}
      {yaCerro && (
        <p className="aviso-extra" role="status">
          <Icono nombre="candado" />
          <span>{AVISO_CERRADA}</span>
        </p>
      )}

      <div className="field">
        <label htmlFor={idCantidad}>¿Cuántas personas de más?</label>
        <div className="cantidad-extra">
          <button
            type="button"
            className="icon-btn"
            aria-label="Una persona menos"
            onClick={() => setCantidad((c) => String(ajustarCantidad(Number(c), -1)))}
          >
            <Icono nombre="menos" />
          </button>
          <input
            id={idCantidad}
            name="cantidad"
            type="number"
            inputMode="numeric"
            min={1}
            max={CANTIDAD_MAXIMA_EXTRA}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            aria-invalid={errores.cantidad ? true : undefined}
          />
          <button
            type="button"
            className="icon-btn"
            aria-label="Una persona más"
            onClick={() => setCantidad((c) => String(ajustarCantidad(Number(c), 1)))}
          >
            <Icono nombre="mas" />
          </button>
        </div>
        {errores.cantidad && <p className="campo-error">{errores.cantidad}</p>}
      </div>

      <div className="field">
        <label htmlFor={idNota}>Nota para la cocina (si hace falta)</label>
        <input
          id={idNota}
          name="nota"
          type="text"
          maxLength={LARGO_MAXIMO_NOTA_EXTRA}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          aria-describedby={idAyudaNota}
          aria-invalid={errores.nota ? true : undefined}
        />
        <p id={idAyudaNota} className="hint">
          La cocina lee esta nota: no escribas nombres.
        </p>
        {errores.nota && <p className="campo-error">{errores.nota}</p>}
      </div>

      <div className="acciones-formulario">
        <button type="submit" className="btn" aria-disabled={pendiente || undefined}>
          {pendiente ? 'Guardando…' : 'Guardar extra'}
        </button>
        <button type="button" className="btn ghost" onClick={alCerrar}>
          Cancelar
        </button>
      </div>
    </form>
  )
}

/**
 * Extras manuales de la semana: comidas de más que el Director le avisa a la cocina (visitas,
 * huéspedes). La cocina ve la cantidad (sumada a las confirmaciones del enlace público) y la nota,
 * nunca quién lo agregó. Se agregan desde hoy; se quitan solo mientras la comida no cerró.
 */
export function ExtrasCasa({
  extras,
  dias,
  cerradas,
}: {
  extras: ExtraManual[]
  /** Días de la semana en que todavía se puede agregar (desde hoy). */
  dias: FechaISO[]
  /** 'fecha|comida' de las comidas de la semana que ya cerraron. */
  cerradas: string[]
}) {
  const [abierto, setAbierto] = useState(false)
  const idFormulario = useId()
  const boton = useRef<HTMLButtonElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const conjunto = new Set(cerradas)

  function cerrar() {
    setAbierto(false)
    boton.current?.focus()
  }

  return (
    <section className="card extras-casa" aria-labelledby="titulo-extras">
      <h2 id="titulo-extras" ref={titulo} tabIndex={-1} className="section-title">
        Extras para la cocina
      </h2>
      <p className="hint">
        Comidas de más que la cocina tiene que preparar (visitas, huéspedes). La cocina ve la cantidad y la nota, nunca
        quién las agregó.
      </p>
      {extras.length === 0 ? (
        <p className="ausencias-vacio">No hay extras esta semana.</p>
      ) : (
        <ul className="lista-ausencias">
          {extras.map((extra) => (
            <FilaExtra
              key={extra.id}
              extra={extra}
              cerrada={conjunto.has(clave(extra.fecha, extra.comida))}
              alQuitar={() => titulo.current?.focus()}
            />
          ))}
        </ul>
      )}
      {dias.length === 0 ? (
        <p className="hint">Esta semana ya pasó: no se pueden agregar extras.</p>
      ) : (
        <>
          <button
            ref={boton}
            type="button"
            className="btn ghost boton-marcar-ausencia"
            aria-expanded={abierto}
            aria-controls={abierto ? idFormulario : undefined}
            onClick={() => (abierto ? cerrar() : setAbierto(true))}
          >
            Agregar extra
            <Icono nombre="abajo" className="flecha" />
          </button>
          {abierto && <FormularioExtra id={idFormulario} dias={dias} cerradas={conjunto} alCerrar={cerrar} />}
        </>
      )}
    </section>
  )
}
