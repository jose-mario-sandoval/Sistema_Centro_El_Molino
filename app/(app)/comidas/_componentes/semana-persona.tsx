'use client'

import Link from 'next/link'
import { Fragment, useEffect, useId, useRef, useState } from 'react'
import { Icono } from '@/components/ui/iconos'
import type { TipoSemana } from '@/lib/comidas/semana'
import { diaCambiadoPorOtro, diaCerrado, etiquetaTarjeta, lineasTarjeta, type DiaDeSemana } from '@/lib/comidas/vista'
import type { Voz } from '@/lib/comidas/voz'
import type { FechaISO } from '@/lib/fechas'
import { ContextoBorradores, useBorradoresDelGrupo } from './borradores-del-grupo'
import { ComidaDelDia } from './comida-del-dia'
import { varsEstado } from './insignia-estado'
import { revelar, revelarAlEntrar } from './revelar'

/**
 * La tarjetita de un día: nombre, fecha, Hoy/Ausente/Cerrado y sus tres comidas con icono + texto
 * corto + color (nunca solo icono). Elevada = se toca; un día cerrado es plano (solo se lee).
 */
function TarjetaDia({
  dia,
  abierta,
  controla,
  alTocar,
}: {
  dia: DiaDeSemana
  abierta: boolean
  controla: string
  alTocar: () => void
}) {
  const cerrado = diaCerrado(dia)
  // Si el Director cambió alguna comida del día, la persona lo ve sin abrir la tarjeta.
  const delDirector = diaCambiadoPorOtro(dia)
  return (
    <button
      type="button"
      className={`tarjeta-dia${dia.esHoy ? ' today' : ''}${cerrado ? ' pasada' : ''}`}
      aria-label={etiquetaTarjeta(dia)}
      aria-expanded={abierta}
      aria-controls={abierta ? controla : undefined}
      onClick={alTocar}
    >
      <span className="tarjeta-cabeza">
        <span className="tarjeta-nombre">{dia.nombre}</span>
        <span className="tarjeta-fecha">{dia.fechaCorta}</span>
      </span>
      {(dia.esHoy || dia.ausente || cerrado || delDirector) && (
        <span className="tarjeta-marcas">
          {dia.esHoy && <span className="etiqueta-hoy">Hoy</span>}
          {dia.ausente && (
            <span className="etiqueta-ausente">
              <Icono nombre="ausencia" />
              Ausente
            </span>
          )}
          {cerrado && (
            <span className="etiqueta-cerrado">
              <Icono nombre="candado" />
              Cerrado
            </span>
          )}
          {delDirector && (
            <span className="etiqueta-director">
              <Icono nombre="editado" />
              Cambió el Director
            </span>
          )}
        </span>
      )}
      <span className="tarjeta-comidas">
        {lineasTarjeta(dia).map((linea) => (
          <span key={linea.comida} className="tarjeta-comida">
            <span className="tarjeta-comida-nombre">{linea.etiqueta}</span>
            <span
              className={`tarjeta-valor${linea.estado ? '' : ' vacia'}`}
              style={linea.estado ? varsEstado(linea.estado) : undefined}
            >
              {/* El icono nunca queda solo en una línea: va pegado a su texto. */}
              <span className="tarjeta-valor-principal">
                <Icono nombre={linea.estado ?? 'sinDefinir'} />
                <span className="tarjeta-valor-texto">{linea.texto}</span>
              </span>
              {linea.hora && <span className="tarjeta-hora">{linea.hora}</span>}
            </span>
          </span>
        ))}
      </span>
    </button>
  )
}

/**
 * La semana de una persona en siete tarjetitas (DESIGN.md §8). Tocar una abre sus tres comidas
 * debajo de su fila, con los mismos controles de siempre; una abierta a la vez. `diaInicial` es el
 * día que se abre solo (hoy en la semana en curso). En La casa, el Director ve la de otra persona:
 * `usuarioId` va a cada acción y los textos pasan a tercera persona (`voz` 'ajena').
 */
export function SemanaPersona({
  dias,
  tipo,
  diaInicial,
  hrefSiguienteSemana,
  usuarioId,
  voz = 'propia',
  persona,
}: {
  dias: DiaDeSemana[]
  tipo: TipoSemana
  diaInicial: FechaISO | null
  /** Solo en la semana en curso: "mañana" nunca se esconde detrás de la paginación. */
  hrefSiguienteSemana: string | null
  usuarioId?: string
  voz?: Voz
  /** Nombre de la persona (La casa). */
  persona?: string
}) {
  const idPanel = useId()
  const borradores = useBorradoresDelGrupo()
  const [abierta, setAbierta] = useState<FechaISO | null>(diaInicial)
  const tarjetaAbierta = useRef<HTMLElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  // El día que se abre solo al entrar se acomoda una vez (revelarAlEntrar); después, solo por toques.
  const porToque = useRef(false)

  useEffect(() => {
    if (abierta && porToque.current) revelar(panel.current, tarjetaAbierta.current)
  }, [abierta])

  useEffect(() => {
    if (!diaInicial) return
    // En el cuadro siguiente: al navegar, Next.js lleva la página arriba después de montarla.
    const cuadro = requestAnimationFrame(() => revelarAlEntrar(panel.current, tarjetaAbierta.current))
    return () => cancelAnimationFrame(cuadro)
    // Solo al montar: `key={lunes}` en la página vuelve a montar al cambiar de semana.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function tocar(fecha: FechaISO) {
    // Cerrar el día abierto (o pasar a otro) guarda lo que quedó escrito en sus comidas; si una nota
    // no sirve, el día sigue abierto con el error a la vista.
    if (abierta && !borradores.confirmarTodos()) return
    porToque.current = true
    setAbierta((antes) => (antes === fecha ? null : fecha))
  }

  const ultimoDia = dias.at(-1)?.esHoy ?? false

  return (
    <>
      {tipo === 'pasada' && (
        <div className="locked-banner">Semana pasada: solo consulta. Podés cambiar la semana actual y la siguiente.</div>
      )}
      <p className="hint semana-ayuda">
        {tipo === 'pasada' ? 'Tocá un día para ver sus comidas.' : 'Tocá un día para ver o cambiar sus comidas.'}
      </p>

      <div className="semana-marco">
        <div className="tarjetas-semana week-list">
          {dias.map((dia) => {
            const esta = abierta === dia.fecha
            const etiqueta = `${dia.nombre} ${dia.fechaCorta}`
            return (
              <Fragment key={dia.fecha}>
                <section ref={esta ? tarjetaAbierta : undefined} aria-label={etiqueta}>
                  <TarjetaDia dia={dia} abierta={esta} controla={idPanel} alTocar={() => tocar(dia.fecha)} />
                </section>
                {/* Justo después de su tarjeta y a todo el ancho: grid-auto-flow dense sube las
                    tarjetas siguientes a la fila de arriba, así el panel queda debajo de esa fila. */}
                {esta && (
                  <div
                    id={idPanel}
                    ref={panel}
                    className={`panel-dia${diaCerrado(dia) ? ' pasada' : ''}`}
                    role="region"
                    aria-labelledby={`${idPanel}-titulo`}
                  >
                    <h2 id={`${idPanel}-titulo`} className="panel-dia-titulo">
                      Comidas del {etiqueta.toLowerCase()}
                    </h2>
                    <ContextoBorradores value={borradores.registrar}>
                      {dia.comidas.map((comida) => (
                        <ComidaDelDia
                          key={comida.comida}
                          fecha={dia.fecha}
                          dia={dia.nombre}
                          etiquetaDia={etiqueta}
                          datos={comida}
                          usuarioId={usuarioId}
                          voz={voz}
                          persona={persona}
                        />
                      ))}
                    </ContextoBorradores>
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      </div>

      {hrefSiguienteSemana && (
        <Link href={hrefSiguienteSemana} className="siguiente-semana">
          <span>
            <span className="siguiente-semana-titulo">Ver la semana que viene</span>
            <span className="hint">
              {ultimoDia
                ? 'Hoy es el último día de esta semana. Mañana ya es la siguiente.'
                : `Ya podés elegir ${voz === 'propia' ? 'tus' : 'sus'} comidas de la próxima semana.`}
            </span>
          </span>
          <Icono nombre="derecha" />
        </Link>
      )}
    </>
  )
}
