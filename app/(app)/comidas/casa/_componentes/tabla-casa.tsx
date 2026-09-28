'use client'

import Link from 'next/link'
import { Fragment, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'
import { Burbuja, devolverFoco, type MotivoCierre } from '@/components/ui/burbuja'
import { Icono } from '@/components/ui/iconos'
import {
  etiquetaAgregarExtra,
  etiquetaCeldaCasa,
  etiquetaGrupo,
  extrasDeComida,
  notasPorComida,
  tituloComidaDePersona,
} from '@/lib/comidas/casa'
import { etiquetaDia, tituloComida } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA, type ExtraManual, type TiempoComida } from '@/lib/comidas/tipos'
import { agruparPorEstado, type ComidaDeLaCasa, type DiaDeLaCasa, type PersonaEnComida } from '@/lib/comidas/vista'
import type { FechaISO } from '@/lib/fechas'
import { ContextoBorradores, useBorradoresDelGrupo } from '../../_componentes/borradores-del-grupo'
import { CeldaResumen } from '../../_componentes/celda-resumen'
import { ContenidoComida } from '../../_componentes/contenido-comida'
import { varsEstado } from '../../_componentes/insignia-estado'
import { revelarDebajoDeFila } from '../../_componentes/revelar'
import { useComidaDelDia } from '../../_componentes/usar-comida-del-dia'
import { BurbujaExtra } from './burbuja-extra'

type Celda = { fecha: FechaISO; comida: TiempoComida }

/** 'cierra hoy 10:00' → 'Cierra hoy 10:00' */
function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function esLaMisma(a: Celda | null, b: Celda): boolean {
  return a?.fecha === b.fecha && a.comida === b.comida
}

/**
 * La semana de la casa para el Director: la misma tabla que ve Administración (un día por fila, una
 * comida por columna, el mismo desglose), pero cada celda es un botón. Tocarla abre, justo debajo de
 * la fila de su día, quiénes comen y cómo, con sus nombres, agrupados por lo que eligieron ("Sin
 * definir" primero); cada nombre abre su comida en una burbuja junto a él, con las mismas piezas y
 * los mismos cierres que todos (DESIGN.md §8). Cada comida desde hoy lleva, en su esquina, "+ Extra":
 * su burbuja agrega extras para la cocina a esa comida y lista los que ya tiene. Una burbuja a la vez.
 */
export function TablaCasa({
  lunes,
  dias,
  extras,
  extrasManuales,
  diasExtra,
  yo,
}: {
  lunes: FechaISO
  dias: DiaDeLaCasa[]
  /** Total de extras por comida (manuales + confirmados por el enlace público). */
  extras: Record<string, Partial<Record<TiempoComida, number>>>
  /** Los extras manuales de la semana, con su nota y sin autor. */
  extrasManuales: ExtraManual[]
  /** Días en que todavía se puede agregar un extra (desde hoy). */
  diasExtra: FechaISO[]
  /** El Director que mira: su propia comida va en segunda persona ("¿Vas a almorzar…?"). */
  yo: string
}) {
  const idBase = useId()
  const idPanel = `${idBase}-panel`
  const idBurbuja = `${idBase}-burbuja`
  const borradores = useBorradoresDelGrupo()
  const [abierta, setAbierta] = useState<Celda | null>(null)
  const [personaAbierta, setPersonaAbierta] = useState<string | null>(null)
  const [extraAbierto, setExtraAbierto] = useState<Celda | null>(null)
  const panel = useRef<HTMLElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const filaAbierta = useRef<HTMLTableRowElement>(null)
  const celdaAbierta = useRef<HTMLButtonElement>(null)
  const anclaPersona = useRef<HTMLButtonElement>(null)
  const anclaExtra = useRef<HTMLButtonElement>(null)
  // La última persona cuya burbuja se abrió: si su nombre cambia de grupo, el foco vuelve a él.
  const ultimaPersona = useRef<string | null>(null)

  const notas = useMemo(() => notasPorComida(extrasManuales), [extrasManuales])
  const conExtra = new Set(diasExtra)

  const dia = abierta ? dias.find((d) => d.fecha === abierta.fecha) : undefined
  const comida = dia?.comidas.find((c) => c.comida === abierta?.comida)
  const grupos = comida ? agruparPorEstado(comida.personas) : []
  const persona = comida?.personas.find((p) => p.id === personaAbierta)

  const diaExtra = extraAbierto ? dias.find((d) => d.fecha === extraAbierto.fecha) : undefined
  const comidaExtra = diaExtra?.comidas.find((c) => c.comida === extraAbierto?.comida)

  useEffect(() => {
    if (!abierta) return
    // El panel va debajo de la fila de su día: se lleva esa fila arriba si el panel no se ve (o el
    // panel, si la fila apilada no deja lugar), y el foco pasa a su título (el teclado y el lector
    // llegan a lo que se abrió).
    titulo.current?.focus({ preventScroll: true })
    revelarDebajoDeFila(panel.current, filaAbierta.current)
    // Solo al abrir otra celda: después, el panel no se mueve solo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta?.fecha, abierta?.comida])

  // Al guardar, la persona pasa al grupo de lo que eligió y su nombre se vuelve a pintar en otro
  // lugar: si el foco se perdió con ese cambio, vuelve a su nombre (nunca queda en la nada).
  useEffect(() => {
    const id = ultimaPersona.current
    if (!id || !abierta) return
    const activo = document.activeElement
    if (activo && activo !== document.body) return
    document.getElementById(`${idBase}-persona-${id}`)?.focus({ preventScroll: true })
  })

  /** Pasar a otra celda, persona o burbuja guarda lo escrito (o pregunta); si no se puede, no cambia. */
  function puedeCambiar(): boolean {
    return (personaAbierta === null && extraAbierto === null) || borradores.confirmarTodos()
  }

  function tocarCelda(celda: Celda) {
    if (!puedeCambiar()) return
    setPersonaAbierta(null)
    setExtraAbierto(null)
    setAbierta((antes) => (esLaMisma(antes, celda) ? null : celda))
  }

  function tocarPersona(id: string) {
    if (!puedeCambiar()) return
    setExtraAbierto(null)
    ultimaPersona.current = id
    if (personaAbierta === id) {
      setPersonaAbierta(null)
      anclaPersona.current?.focus({ preventScroll: true })
      return
    }
    setPersonaAbierta(id)
  }

  function tocarExtra(celda: Celda) {
    if (!puedeCambiar()) return
    setPersonaAbierta(null)
    if (esLaMisma(extraAbierto, celda)) {
      setExtraAbierto(null)
      anclaExtra.current?.focus({ preventScroll: true })
      return
    }
    setExtraAbierto(celda)
  }

  function cerrarPanel() {
    if (!puedeCambiar()) return
    const celda = celdaAbierta.current
    setPersonaAbierta(null)
    setAbierta(null)
    celda?.focus()
  }

  return (
    <div className="card admin-table-scroll">
      <div className="section-title">La semana de la casa</div>
      <p className="hint tabla-casa-ayuda">
        Tocá una comida para ver quiénes comen y cambiar la de cada persona. Con «Extra» le avisás a la cocina que
        prepare comidas de más.
      </p>
      <table className="admin-week-table tabla-casa">
        <thead>
          <tr>
            <th scope="col">Día</th>
            {TIEMPOS_COMIDA.map((c) => (
              <th key={c} scope="col">
                {ETIQUETA_TIEMPO[c]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dias.map((d) => {
            const diaAbierto = abierta?.fecha === d.fecha
            return (
              <Fragment key={d.fecha}>
                <tr ref={diaAbierto ? filaAbierta : undefined} className={d.esHoy ? 'hoy' : undefined}>
                  <th scope="row" className="namecell">
                    {etiquetaDia(d.fecha)}
                    {d.esHoy && <span className="etiqueta-hoy">Hoy</span>}
                    {/* Día cerrado: plano, con candado y "Cerrado" escritos (como su tarjeta en la Semana). */}
                    {d.comidas.every((c) => !c.abierta) && (
                      <span className="etiqueta-cerrado">
                        <Icono nombre="candado" />
                        Cerrado
                      </span>
                    )}
                  </th>
                  {d.comidas.map((c, _i, todas) => {
                    const celda = { fecha: d.fecha, comida: c.comida }
                    const esta = diaAbierto && abierta?.comida === c.comida
                    const extraEsta = esLaMisma(extraAbierto, celda)
                    const extra = extras[d.fecha]?.[c.comida]
                    const notasCelda = notas[d.fecha]?.[c.comida] ?? []
                    const puedeExtra = conExtra.has(d.fecha)
                    return (
                      // data-et: en el teléfono la tabla se apila y cada celda muestra su comida.
                      <td key={c.comida} data-fecha={d.fecha} data-comida={c.comida} data-et={ETIQUETA_TIEMPO[c.comida]}>
                        <div className="celda-casa-marco">
                          <button
                            ref={esta ? celdaAbierta : undefined}
                            type="button"
                            className={`celda-casa${c.abierta ? '' : ' cerrada'}${puedeExtra ? ' con-extra' : ''}`}
                            aria-label={etiquetaCeldaCasa(
                              c.comida,
                              d.nombre,
                              d.fechaCorta,
                              c.resumen,
                              extra,
                              !c.abierta,
                              notasCelda,
                            )}
                            aria-expanded={esta}
                            aria-controls={esta ? idPanel : undefined}
                            onClick={() => tocarCelda(celda)}
                          >
                            <CeldaResumen resumen={c.resumen} extra={extra} notas={notasCelda} como="spans" />
                            {/* En un día a medio cerrar (hoy), cada comida cerrada lo dice escrito. */}
                            {!c.abierta && todas.some((otra) => otra.abierta) && (
                              <span className="etiqueta-cerrado celda-casa-cerrada">
                                <Icono nombre="candado" />
                                Cerrada
                              </span>
                            )}
                          </button>
                          {/* En la esquina de la comida, al lado (nunca dentro) de su botón: agregar
                              extras a esa comida. Desde hoy; en una comida de hoy que ya cerró, sigue
                              (la burbuja avisa). */}
                          {puedeExtra && (
                            <button
                              ref={extraEsta ? anclaExtra : undefined}
                              type="button"
                              className="extra-mas"
                              data-abre-burbuja=""
                              aria-haspopup="dialog"
                              aria-expanded={extraEsta}
                              aria-controls={extraEsta ? idBurbuja : undefined}
                              aria-label={etiquetaAgregarExtra(c.comida, d.nombre, d.fechaCorta)}
                              onClick={() => tocarExtra(celda)}
                            >
                              <span className="extra-mas-pastilla">
                                <Icono nombre="mas" />
                                Extra
                              </span>
                            </button>
                          )}
                        </div>
                      </td>
                    )
                  })}
                </tr>
                {/* Justo debajo de la fila de su día, a todo el ancho (también apilada en el teléfono). */}
                {diaAbierto && comida && abierta && (
                  <tr className="fila-panel">
                    <td colSpan={TIEMPOS_COMIDA.length + 1}>
                      <PanelQuienes
                        id={idPanel}
                        idBurbuja={idBurbuja}
                        panel={panel}
                        titulo={titulo}
                        idBase={idBase}
                        textoTitulo={tituloComida(abierta.comida, d.nombre, d.fechaCorta)}
                        comida={comida}
                        grupos={grupos}
                        personaAbierta={personaAbierta}
                        anclaPersona={anclaPersona}
                        alTocarPersona={tocarPersona}
                        alCerrar={cerrarPanel}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>

      <ContextoBorradores value={borradores.registrar}>
        {dia && persona && (
          <BurbujaPersona
            key={`${dia.fecha}|${persona.datos.comida}|${persona.id}`}
            id={idBurbuja}
            ancla={anclaPersona}
            dia={dia}
            persona={persona}
            propia={persona.id === yo}
            lunes={lunes}
            alCerrar={() => setPersonaAbierta(null)}
          />
        )}
        {diaExtra && comidaExtra && (
          <BurbujaExtra
            key={`${diaExtra.fecha}|${comidaExtra.comida}`}
            id={idBurbuja}
            ancla={anclaExtra}
            fecha={diaExtra.fecha}
            comida={comidaExtra.comida}
            nombreDia={diaExtra.nombre}
            fechaCorta={diaExtra.fechaCorta}
            sinCerrar={comidaExtra.sinCerrar}
            extras={extrasDeComida(extrasManuales, diaExtra.fecha, comidaExtra.comida)}
            alCerrar={() => setExtraAbierto(null)}
          />
        )}
      </ContextoBorradores>
    </div>
  )
}

/** La comida de una persona, en la burbuja junto a su nombre: la misma que ve ella en su Semana. */
function BurbujaPersona({
  id,
  ancla,
  dia,
  persona,
  propia,
  lunes,
  alCerrar,
}: {
  id: string
  ancla: RefObject<HTMLElement | null>
  dia: DiaDeLaCasa
  persona: PersonaEnComida
  /** El Director mirándose a sí mismo: en segunda persona. */
  propia: boolean
  lunes: FechaISO
  alCerrar: () => void
}) {
  const voz = propia ? 'propia' : 'ajena'
  const comida = useComidaDelDia({ fecha: dia.fecha, datos: persona.datos, usuarioId: persona.id, voz })
  const tituloId = `${id}-titulo`

  /** "Listo", un toque fuera o Tab guardan lo escrito (o avisan y no cierran); Escape descarta. */
  function cerrar(motivo: MotivoCierre): boolean {
    if (!comida.soltar(motivo)) return false
    const boton = ancla.current
    alCerrar()
    devolverFoco(motivo, boton)
    return true
  }

  return (
    <Burbuja id={id} ancla={ancla} tituloId={tituloId} className="burbuja-persona" alCerrar={cerrar}>
      <ContenidoComida
        tituloId={tituloId}
        titulo={tituloComidaDePersona(persona.datos.comida, dia.nombre, dia.fechaCorta, propia ? null : persona.nombre)}
        dia={dia.nombre}
        datos={persona.datos}
        comida={comida}
        voz={voz}
        persona={persona.nombre}
        alListo={() => cerrar('listo')}
        pie={
          <Link href={`/comidas/casa/${persona.id}?semana=${lunes}`} className="enlace-persona">
            {propia ? 'Ver toda mi semana' : `Ver la semana de ${persona.nombre}`}
            <Icono nombre="derecha" />
          </Link>
        }
      />
    </Burbuja>
  )
}

/** Quiénes comen una comida, agrupados por lo que eligieron; cada nombre abre su comida en una burbuja. */
function PanelQuienes({
  id,
  idBurbuja,
  panel,
  titulo,
  idBase,
  textoTitulo,
  comida,
  grupos,
  personaAbierta,
  anclaPersona,
  alTocarPersona,
  alCerrar,
}: {
  id: string
  idBurbuja: string
  panel: React.RefObject<HTMLElement | null>
  titulo: React.RefObject<HTMLHeadingElement | null>
  idBase: string
  textoTitulo: string
  comida: ComidaDeLaCasa
  grupos: ReturnType<typeof agruparPorEstado>
  personaAbierta: string | null
  anclaPersona: React.RefObject<HTMLButtonElement | null>
  alTocarPersona: (id: string) => void
  alCerrar: () => void
}) {
  return (
    <section
      id={id}
      ref={panel}
      className={`panel-casa${comida.abierta ? '' : ' pasada'}`}
      aria-labelledby={`${id}-titulo`}
      onKeyDown={(e) => {
        // Escape con el foco en un nombre o en el título cierra el panel (con una burbuja abierta, la
        // atiende ella: cierra solo la burbuja).
        if (e.key !== 'Escape' || !(e.target instanceof HTMLElement)) return
        if (e.target.closest('.persona-casa') || e.target === titulo.current) alCerrar()
      }}
    >
      <h2 id={`${id}-titulo`} ref={titulo} tabIndex={-1} className="panel-casa-titulo">
        {textoTitulo}
      </h2>
      {comida.abierta ? (
        <p className="detalle-cierre">{conMayuscula(comida.cierre)}. Tocá un nombre para cambiar su comida.</p>
      ) : (
        <p className="motivo-cierre">
          <Icono nombre="candado" />
          <span>Cerrada: ya no se puede cambiar. Tocá un nombre para ver su comida.</span>
        </p>
      )}

      {grupos.length === 0 ? (
        <p className="ausencias-vacio">No hay personas con comidas en la casa.</p>
      ) : (
        <div className="grupos-casa">
          {grupos.map((grupo) => (
            <div key={grupo.clave} className="grupo-casa" role="group" aria-labelledby={`${idBase}-grupo-${grupo.clave}`}>
              <h3
                id={`${idBase}-grupo-${grupo.clave}`}
                className={`grupo-casa-titulo${grupo.clave === 'sin_definir' ? ' sin-definir' : ''}`}
                style={grupo.clave === 'sin_definir' ? undefined : varsEstado(grupo.clave)}
              >
                <Icono nombre={grupo.clave === 'sin_definir' ? 'sinDefinir' : grupo.clave} />
                {etiquetaGrupo(grupo.etiqueta, grupo.personas.length)}
              </h3>
              <ul className="personas-casa">
                {grupo.personas.map((p) => {
                  const esta = personaAbierta === p.id
                  return (
                    <li key={p.id}>
                      <button
                        id={`${idBase}-persona-${p.id}`}
                        ref={esta ? anclaPersona : undefined}
                        type="button"
                        className="persona-casa"
                        data-abre-burbuja=""
                        aria-haspopup="dialog"
                        aria-expanded={esta}
                        aria-controls={esta ? idBurbuja : undefined}
                        onClick={() => alTocarPersona(p.id)}
                      >
                        <span className="persona-casa-nombre">{p.nombre}</span>
                        <Icono nombre="abajo" className="flecha" />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="acciones-formulario">
        <button type="button" className="btn ghost" onClick={alCerrar}>
          Cerrar
        </button>
      </div>
    </section>
  )
}
