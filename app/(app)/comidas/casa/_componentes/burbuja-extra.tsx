'use client'

import { useEffect, useId, useRef, useState, useTransition, type RefObject } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Burbuja, devolverFoco, type MotivoCierre } from '@/components/ui/burbuja'
import { Icono } from '@/components/ui/iconos'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { ajustarCantidad, extraSinGuardar, textoCantidadExtra, textoExtra, tituloExtras } from '@/lib/comidas/casa'
import { CANTIDAD_MAXIMA_EXTRA, LARGO_MAXIMO_NOTA_EXTRA, type ExtraManual, type TiempoComida } from '@/lib/comidas/tipos'
import type { FechaISO } from '@/lib/fechas'
import { useAvisarAlGrupo } from '../../_componentes/borradores-del-grupo'
import { agregarExtra, quitarExtra } from '../acciones'

const AVISO_CERRADA = 'Esa comida ya cerró: la cocina puede no verlo a tiempo.'

/** Un extra ya agregado: cuántas personas y la nota; "Quitar" (con confirmación) mientras la comida no cerró. */
function FilaExtra({ extra, cerrada, alQuitar }: { extra: ExtraManual; cerrada: boolean; alQuitar: () => void }) {
  const aviso = useAviso()
  const [confirmando, setConfirmando] = useState(false)
  const [pendiente, iniciar] = useTransition()
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
        // La fila desaparece: el foco va a un título, nunca a la nada.
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
        <span className="extra-cuanto">{textoCantidadExtra(extra.cantidad)}</span>
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
          {/* Quitando: aria-disabled y no disabled, para que el foco no se pierda a media acción. */}
          <button
            type="button"
            className="btn danger small"
            aria-disabled={pendiente || undefined}
            onClick={() => {
              if (!pendiente) quitar()
            }}
          >
            {pendiente ? 'Quitando…' : 'Sí, quitar'}
          </button>
          {/* Al pedir confirmación el foco va a la opción segura. */}
          <button
            type="button"
            className="btn ghost small"
            aria-disabled={pendiente || undefined}
            onClick={() => {
              if (!pendiente) dejarDeConfirmar()
            }}
            autoFocus
          >
            Cancelar
          </button>
        </span>
      ) : (
        <button
          ref={botonQuitar}
          type="button"
          className="btn ghost small"
          onClick={() => setConfirmando(true)}
          aria-label={`Quitar el extra: ${textoExtra(extra)}`}
        >
          Quitar
        </button>
      )}
    </li>
  )
}

/**
 * La burbuja del "+ Extra" de una comida en La casa: comidas de más que la cocina tiene que preparar
 * para esa comida (visitas, huéspedes). Cantidad, una nota opcional (la cocina la lee: sin nombres)
 * y "Agregar"; debajo, los extras que ya tiene esa comida, con "Quitar" mientras no cerró. Se agregan
 * desde hoy; en una comida que ya cerró se puede igual, avisando antes que la cocina puede no verlo.
 *
 * Lo escrito nunca se pierde en silencio: si hay algo sin agregar, "Cerrar", un toque fuera o pasar a
 * otra comida no cierran: preguntan "¿Agregar o descartar?". Escape descarta (es un pedido explícito).
 */
export function BurbujaExtra({
  id,
  ancla,
  fecha,
  comida,
  nombreDia,
  fechaCorta,
  sinCerrar,
  extras,
  alCerrar,
}: {
  id: string
  ancla: RefObject<HTMLElement | null>
  fecha: FechaISO
  comida: TiempoComida
  /** 'Miércoles' */
  nombreDia: string
  /** '30/9' */
  fechaCorta: string
  /** La comida no cerró: sus extras todavía se pueden quitar, y agregar uno no lleva aviso. */
  sinCerrar: boolean
  /** Los extras manuales de esta comida. */
  extras: readonly ExtraManual[]
  alCerrar: () => void
}) {
  const aviso = useAviso()
  const idTitulo = `${id}-titulo`
  const idCantidad = useId()
  const idNota = useId()
  const idAyudaNota = useId()
  const idLista = useId()
  const titulo = useRef<HTMLHeadingElement>(null)
  const tituloLista = useRef<HTMLHeadingElement>(null)
  const botonAgregar = useRef<HTMLButtonElement>(null)
  const [cantidad, setCantidad] = useState('1')
  const [nota, setNota] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [preguntando, setPreguntando] = useState(false)
  const [pendiente, iniciar] = useTransition()
  const sinAgregar = extraSinGuardar({ cantidad, nota })
  // La respuesta de "Agregar" puede llegar con la burbuja ya cerrada (o con otra abierta).
  const abierta = useRef(true)
  useEffect(() => {
    abierta.current = true
    return () => {
      abierta.current = false
    }
  }, [])

  /**
   * true si se puede cerrar. Si hay algo sin agregar, pregunta y no deja; el foco va a "Agregar" (la
   * pregunta se anuncia con role="alert" y la respuesta está a mano), también si ya estaba preguntando.
   * Mientras se agrega, se puede cerrar: lo escrito ya va en camino.
   */
  function puedeCerrar(): boolean {
    if (!sinAgregar || pendiente) return true
    setPreguntando(true)
    botonAgregar.current?.focus({ preventScroll: true })
    return false
  }

  // Tocar otra comida o un nombre de "quiénes comen" también pregunta antes de cerrar esta.
  useAvisarAlGrupo(puedeCerrar)

  function cerrar(motivo: MotivoCierre): boolean {
    if (motivo !== 'escape' && !puedeCerrar()) return false
    const boton = ancla.current
    alCerrar()
    devolverFoco(motivo, boton)
    return true
  }

  function limpiarError(campo: string) {
    setPreguntando(false)
    setErrores((antes) => {
      if (!(campo in antes) && !('general' in antes)) return antes
      const copia = { ...antes }
      delete copia[campo]
      delete copia.general
      return copia
    })
  }

  function agregar() {
    if (pendiente) return
    setPreguntando(false)
    iniciar(async () => {
      let resultado: Resultado<null>
      try {
        resultado = await agregarExtra({ fecha, comida, cantidad, nota })
      } catch {
        resultado = fallo('No se pudo agregar el extra. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) {
        aviso('Extra agregado. La cocina ya lo ve.')
        if (!abierta.current) return
        // La celda ya muestra "+N extra": la burbuja se cierra y el foco vuelve a su "+ Extra".
        const boton = ancla.current
        alCerrar()
        boton?.focus({ preventScroll: true })
        return
      }
      if (!abierta.current) {
        aviso(resultado.error)
        return
      }
      if (resultado.campos) {
        const { cantidad: enCantidad, nota: enNota, ...otros } = resultado.campos
        setErrores({
          ...(enCantidad ? { cantidad: enCantidad } : {}),
          ...(enNota ? { nota: enNota } : {}),
          ...(Object.values(otros)[0] ? { general: Object.values(otros)[0] } : {}),
        })
      } else {
        aviso(resultado.error)
      }
    })
  }

  return (
    <Burbuja id={id} ancla={ancla} tituloId={idTitulo} enfocarDialogo alCerrar={cerrar}>
      <div className="burbuja-cabeza">
        <h2 id={idTitulo} ref={titulo} tabIndex={-1} className="burbuja-titulo">
          {tituloExtras(comida, nombreDia, fechaCorta)}
        </h2>
      </div>

      <form
        className="formulario-extra"
        noValidate
        aria-busy={pendiente || undefined}
        onSubmit={(e) => {
          e.preventDefault()
          agregar()
        }}
      >
        {/* Antes de agregar: un extra de una comida que ya cerró se guarda igual (un invitado de último
            momento), pero la cocina puede haber cocinado ya. */}
        {!sinCerrar && (
          <p className="aviso-extra">
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
              onClick={() => {
                limpiarError('cantidad')
                setCantidad((c) => String(ajustarCantidad(Number(c), -1)))
              }}
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
              onChange={(e) => {
                limpiarError('cantidad')
                setCantidad(e.target.value)
              }}
              aria-invalid={errores.cantidad ? true : undefined}
              aria-describedby={errores.cantidad ? `${idCantidad}-error` : undefined}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label="Una persona más"
              onClick={() => {
                limpiarError('cantidad')
                setCantidad((c) => String(ajustarCantidad(Number(c), 1)))
              }}
            >
              <Icono nombre="mas" />
            </button>
          </div>
          {errores.cantidad && (
            <p id={`${idCantidad}-error`} className="campo-error">
              {errores.cantidad}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor={idNota}>Nota para la cocina (si hace falta)</label>
          <input
            id={idNota}
            name="nota"
            type="text"
            maxLength={LARGO_MAXIMO_NOTA_EXTRA}
            value={nota}
            onChange={(e) => {
              limpiarError('nota')
              setNota(e.target.value)
            }}
            aria-describedby={errores.nota ? `${idAyudaNota} ${idNota}-error` : idAyudaNota}
            aria-invalid={errores.nota ? true : undefined}
          />
          <p id={idAyudaNota} className="hint">
            La cocina lee esta nota: no escribas nombres.
          </p>
          {errores.nota && (
            <p id={`${idNota}-error`} className="campo-error">
              {errores.nota}
            </p>
          )}
        </div>

        {errores.general && <p className="campo-error">{errores.general}</p>}
        {preguntando && (
          <p className="aviso-extra pregunta-extra" role="alert">
            <Icono nombre="sinDefinir" />
            <span>Todavía no agregaste este extra. ¿Agregar o descartar?</span>
          </p>
        )}

        <div className="burbuja-pie">
          <button ref={botonAgregar} type="submit" className="btn" aria-disabled={pendiente || undefined}>
            <Icono nombre="mas" />
            {pendiente ? 'Agregando…' : 'Agregar'}
          </button>
          {preguntando ? (
            <button type="button" className="btn danger" onClick={() => cerrar('escape')}>
              Descartar
            </button>
          ) : (
            <button type="button" className="btn ghost" onClick={() => cerrar('listo')}>
              Cerrar
            </button>
          )}
        </div>
      </form>

      {extras.length > 0 && (
        <section className="extras-de-comida" aria-labelledby={idLista}>
          <h3 id={idLista} ref={tituloLista} tabIndex={-1} className="burbuja-subtitulo">
            Ya agregados para esta comida
          </h3>
          <ul className="lista-ausencias">
            {extras.map((extra) => (
              <FilaExtra
                key={extra.id}
                extra={extra}
                cerrada={!sinCerrar}
                // Si quedan otros, el foco va al título de la lista; si era el único, al de la burbuja.
                alQuitar={() => (extras.length > 1 ? tituloLista.current : titulo.current)?.focus()}
              />
            ))}
          </ul>
        </section>
      )}
    </Burbuja>
  )
}
