'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { Icono } from '@/components/ui/iconos'
import { etiquetaCeldaCasa, etiquetaGrupo, tituloComidaCasa } from '@/lib/comidas/casa'
import { etiquetaDia } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO, TIEMPOS_COMIDA, type TiempoComida } from '@/lib/comidas/tipos'
import { agruparPorEstado, type DiaDeLaCasa } from '@/lib/comidas/vista'
import type { FechaISO } from '@/lib/fechas'
import { ContextoBorradores, useBorradoresDelGrupo } from '../../_componentes/borradores-del-grupo'
import { CeldaResumen } from '../../_componentes/celda-resumen'
import { ComidaDelDia } from '../../_componentes/comida-del-dia'
import { varsEstado } from '../../_componentes/insignia-estado'
import { revelar } from '../../_componentes/revelar'

type Abierta = { fecha: FechaISO; comida: TiempoComida }

/** 'cierra hoy 10:00' → 'Cierra hoy 10:00' */
function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * La semana de la casa para el Director: la misma tabla que ve Administración (un día por fila, una
 * comida por columna, el mismo desglose), pero cada celda es un botón. Tocarla abre debajo de la
 * tabla quiénes comen y cómo, con sus nombres, agrupados por lo que eligieron ("Sin definir" primero);
 * cada nombre abre su comida para cambiarla en el lugar, con los mismos cierres que todos.
 */
export function TablaCasa({
  lunes,
  dias,
  extras,
  yo,
}: {
  lunes: FechaISO
  dias: DiaDeLaCasa[]
  extras: Record<string, Partial<Record<TiempoComida, number>>>
  /** El Director que mira: su propia comida va en segunda persona ("¿Vas a almorzar…?"). */
  yo: string
}) {
  const idBase = useId()
  const idPanel = `${idBase}-panel`
  const borradores = useBorradoresDelGrupo()
  const [abierta, setAbierta] = useState<Abierta | null>(null)
  const [personaAbierta, setPersonaAbierta] = useState<string | null>(null)
  const panel = useRef<HTMLElement>(null)
  const celdaAbierta = useRef<HTMLButtonElement>(null)

  const dia = abierta ? dias.find((d) => d.fecha === abierta.fecha) : undefined
  const comida = dia?.comidas.find((c) => c.comida === abierta?.comida)
  const grupos = comida ? agruparPorEstado(comida.personas) : []
  const grupoDeLaAbierta = grupos.find((g) => g.personas.some((p) => p.id === personaAbierta))?.clave ?? null

  useEffect(() => {
    if (abierta) revelar(panel.current, celdaAbierta.current)
    // Solo al abrir otra celda: después, el panel no se mueve solo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta?.fecha, abierta?.comida])

  // Al guardar, la persona pasa al grupo de lo que eligió y su lugar se vuelve a pintar: si el foco
  // se perdió con ese cambio, vuelve a su nombre (nunca queda en la nada).
  useEffect(() => {
    if (!personaAbierta || !grupoDeLaAbierta) return
    if (document.activeElement && document.activeElement !== document.body) return
    document.getElementById(`${idBase}-persona-${personaAbierta}`)?.focus()
  }, [grupoDeLaAbierta, personaAbierta, idBase])

  /** Cambiar de celda o de persona guarda lo que quedó escrito; si una nota no sirve, no se cambia. */
  function puedeCambiar(): boolean {
    return personaAbierta === null || borradores.confirmarTodos()
  }

  function tocarCelda(celda: Abierta) {
    if (!puedeCambiar()) return
    setPersonaAbierta(null)
    setAbierta((antes) => (antes?.fecha === celda.fecha && antes.comida === celda.comida ? null : celda))
  }

  function tocarPersona(id: string) {
    if (!puedeCambiar()) return
    setPersonaAbierta((antes) => (antes === id ? null : id))
  }

  function cerrarPanel() {
    if (!puedeCambiar()) return
    setPersonaAbierta(null)
    setAbierta(null)
    celdaAbierta.current?.focus()
  }

  return (
    <>
      <div className="card admin-table-scroll">
        <div className="section-title">La semana de la casa</div>
        <p className="hint tabla-casa-ayuda">Tocá una comida para ver quiénes comen y cambiar la de cada persona.</p>
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
            {dias.map((d) => (
              <tr key={d.fecha} className={d.esHoy ? 'hoy' : undefined}>
                <th scope="row" className="namecell">
                  {etiquetaDia(d.fecha)}
                  {d.esHoy && <span className="etiqueta-hoy">Hoy</span>}
                </th>
                {d.comidas.map((c) => {
                  const esta = abierta?.fecha === d.fecha && abierta.comida === c.comida
                  const extra = extras[d.fecha]?.[c.comida]
                  return (
                    // data-et: en el teléfono la tabla se apila y cada celda muestra su comida.
                    <td key={c.comida} data-fecha={d.fecha} data-comida={c.comida} data-et={ETIQUETA_TIEMPO[c.comida]}>
                      <button
                        ref={esta ? celdaAbierta : undefined}
                        type="button"
                        className={`celda-casa${c.abierta ? '' : ' cerrada'}`}
                        aria-label={etiquetaCeldaCasa(c.comida, d.nombre, d.fechaCorta, c.resumen, extra)}
                        aria-expanded={esta}
                        aria-controls={esta ? idPanel : undefined}
                        onClick={() => tocarCelda({ fecha: d.fecha, comida: c.comida })}
                      >
                        <CeldaResumen resumen={c.resumen} extra={extra} como="spans" />
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dia && comida && abierta && (
        <section
          id={idPanel}
          ref={panel}
          className={`panel-casa${comida.abierta ? '' : ' pasada'}`}
          aria-labelledby={`${idPanel}-titulo`}
          onKeyDown={(e) => {
            // Escape con el foco en un nombre cierra el panel (dentro de una comida lo atiende ella).
            if (e.key === 'Escape' && e.target instanceof HTMLElement && e.target.closest('.persona-casa')) cerrarPanel()
          }}
        >
          <h2 id={`${idPanel}-titulo`} className="panel-dia-titulo">
            {tituloComidaCasa(abierta.comida, dia.nombre, dia.fechaCorta)}
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
                    {grupo.personas.map((persona) => {
                      const esta = personaAbierta === persona.id
                      const idComida = `${idBase}-comida-${persona.id}`
                      const propia = persona.id === yo
                      return (
                        <li key={persona.id}>
                          <button
                            id={`${idBase}-persona-${persona.id}`}
                            type="button"
                            className="persona-casa"
                            aria-expanded={esta}
                            aria-controls={esta ? idComida : undefined}
                            onClick={() => tocarPersona(persona.id)}
                          >
                            <span className="persona-casa-nombre">{persona.nombre}</span>
                            <Icono nombre="abajo" className="flecha" />
                          </button>
                          {esta && (
                            <div id={idComida} className="persona-comida">
                              <ContextoBorradores value={borradores.registrar}>
                                <ComidaDelDia
                                  fecha={dia.fecha}
                                  dia={dia.nombre}
                                  etiquetaDia={`${dia.nombre} ${dia.fechaCorta}`}
                                  datos={persona.datos}
                                  usuarioId={persona.id}
                                  voz={propia ? 'propia' : 'ajena'}
                                  persona={persona.nombre}
                                />
                              </ContextoBorradores>
                              <Link href={`/comidas/casa/${persona.id}?semana=${lunes}`} className="enlace-persona">
                                {propia ? 'Ver toda mi semana' : `Ver la semana de ${persona.nombre}`}
                                <Icono nombre="derecha" />
                              </Link>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}

          <div className="acciones-formulario">
            <button type="button" className="btn ghost" onClick={cerrarPanel}>
              Cerrar
            </button>
          </div>
        </section>
      )}
    </>
  )
}
