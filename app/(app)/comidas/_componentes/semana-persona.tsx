'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { Burbuja, devolverFoco, type MotivoCierre } from '@/components/ui/burbuja'
import { Icono } from '@/components/ui/iconos'
import type { TipoSemana } from '@/lib/comidas/semana'
import { tituloComida } from '@/lib/comidas/semana'
import { ETIQUETA_TIEMPO } from '@/lib/comidas/tipos'
import {
  diaCerrado,
  etiquetaComidaTarjeta,
  semanaCambiadaPorOtro,
  textoCorto,
  type ComidaDeSemana,
  type DiaDeSemana,
} from '@/lib/comidas/vista'
import type { Voz } from '@/lib/comidas/voz'
import type { FechaISO } from '@/lib/fechas'
import { ContextoBorradores, useBorradoresDelGrupo } from './borradores-del-grupo'
import { ContenidoComida } from './contenido-comida'
import { varsEstado } from './insignia-estado'
import { revelarAlEntrar } from './revelar'
import { useComidaDelDia } from './usar-comida-del-dia'

/** Icono + texto corto + hora: el valor de una comida en su tarjeta (nunca solo el icono). */
function ValorCorto({ comida }: { comida: ComidaDeSemana['valor'] }) {
  const corto = textoCorto(comida)
  return (
    <span className="comida-tarjeta-valor">
      <Icono nombre={corto.estado ?? 'sinDefinir'} />
      <span className="comida-tarjeta-texto">{corto.texto}</span>
      {corto.hora && <span className="tarjeta-hora">{corto.hora}</span>}
    </span>
  )
}

/** "Director" con el lápiz: la cambió él (la leyenda arriba de las tarjetas lo explica entero). */
function MarcaDirector() {
  return (
    <span className="celda-director">
      <Icono nombre="editado" />
      Director
    </span>
  )
}

/**
 * Una comida en la tarjeta de su día. Abierta: un botón elevado con su color, su icono y su texto;
 * tocarlo abre la burbuja con las opciones junto a él. Cerrada: plana, solo se lee.
 */
function ComidaDeTarjeta({
  dia,
  datos,
  abierta,
  idBurbuja,
  diaAMedioCerrar,
  alAbrir,
  alCerrar,
  usuarioId,
  voz,
  persona,
}: {
  dia: DiaDeSemana
  datos: ComidaDeSemana
  abierta: boolean
  idBurbuja: string
  /** Hoy, con alguna comida ya cerrada y otras no: cada cerrada lo dice escrito. */
  diaAMedioCerrar: boolean
  alAbrir: () => void
  alCerrar: () => void
  usuarioId?: string
  voz: Voz
  persona?: string
}) {
  const comida = useComidaDelDia({ fecha: dia.fecha, datos, usuarioId, voz })
  const boton = useRef<HTMLButtonElement>(null)
  const nombre = ETIQUETA_TIEMPO[datos.comida]
  const delDirector = comida.valor?.cambiadaPorOtro === true

  // Cerró con su burbuja abierta (pasó la hora mientras se miraba): la burbuja se va con el botón.
  useEffect(() => {
    if (abierta && !comida.editable) alCerrar()
  }, [abierta, comida.editable, alCerrar])

  if (!comida.editable) {
    return (
      <div className="comida-tarjeta cerrada" data-fecha={dia.fecha} data-comida={datos.comida}>
        <span className="comida-tarjeta-nombre">{nombre}</span>
        <span
          className={`tarjeta-valor${comida.valor ? '' : ' vacia'}`}
          style={comida.valor ? varsEstado(comida.valor.estado) : undefined}
        >
          <ValorCorto comida={comida.valor} />
        </span>
        {delDirector && <MarcaDirector />}
        {diaAMedioCerrar && (
          <span className="etiqueta-cerrado">
            <Icono nombre="candado" />
            Cerrada
          </span>
        )}
      </div>
    )
  }

  /** "Listo", volver a tocar la comida, un toque fuera: guarda lo escrito (o avisa y no cierra); Escape descarta. */
  function cerrar(motivo: MotivoCierre): boolean {
    if (!comida.soltar(motivo)) return false
    alCerrar()
    devolverFoco(motivo, boton.current)
    return true
  }

  return (
    <>
      <button
        ref={boton}
        type="button"
        className={`comida-tarjeta${comida.valor ? '' : ' vacia'}`}
        style={comida.valor ? varsEstado(comida.valor.estado) : undefined}
        data-fecha={dia.fecha}
        data-comida={datos.comida}
        data-abre-burbuja=""
        aria-haspopup="dialog"
        aria-expanded={abierta}
        aria-controls={abierta ? idBurbuja : undefined}
        aria-label={etiquetaComidaTarjeta(dia, datos.comida, comida.valor)}
        aria-busy={comida.pendiente || undefined}
        onClick={() => (abierta ? cerrar('listo') : alAbrir())}
      >
        <span className="comida-tarjeta-nombre">{nombre}</span>
        <ValorCorto comida={comida.valor} />
        {delDirector && <MarcaDirector />}
      </button>
      {abierta && (
        <Burbuja id={idBurbuja} ancla={boton} tituloId={`${idBurbuja}-titulo`} alCerrar={cerrar}>
          <ContenidoComida
            tituloId={`${idBurbuja}-titulo`}
            titulo={tituloComida(datos.comida, dia.nombre, dia.fechaCorta)}
            dia={dia.nombre}
            datos={datos}
            comida={comida}
            voz={voz}
            persona={persona}
            alListo={() => cerrar('listo')}
          />
        </Burbuja>
      )}
    </>
  )
}

/**
 * La tarjetita de un día: nombre, fecha, Hoy/Ausente/Cerrado y sus tres comidas. La tarjeta ya no se
 * toca entera: es una bandeja (hundida) y lo que se toca son sus comidas (elevadas), cada una con su
 * color, su icono y su texto. Un día cerrado es plano: solo se lee.
 */
function TarjetaDia({
  ref,
  dia,
  abierta,
  idBurbuja,
  alAbrir,
  alCerrar,
  usuarioId,
  voz,
  persona,
}: {
  ref?: Ref<HTMLElement>
  dia: DiaDeSemana
  /** La comida de este día con la burbuja abierta. */
  abierta: ComidaDeSemana['comida'] | null
  idBurbuja: string
  alAbrir: (comida: ComidaDeSemana['comida']) => void
  alCerrar: () => void
  usuarioId?: string
  voz: Voz
  persona?: string
}) {
  const cerrado = diaCerrado(dia)
  const aMedioCerrar = !cerrado && dia.comidas.some((c) => !c.abierta)
  return (
    <section
      ref={ref}
      className={`tarjeta-dia${dia.esHoy ? ' today' : ''}${cerrado ? ' pasada' : ''}`}
      aria-label={`${dia.nombre} ${dia.fechaCorta}`}
    >
      <div className="tarjeta-cabeza">
        <h2 className="tarjeta-nombre">{dia.nombre}</h2>
        <span className="tarjeta-fecha">{dia.fechaCorta}</span>
      </div>
      {(dia.esHoy || dia.ausente || cerrado) && (
        <div className="tarjeta-marcas">
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
        </div>
      )}
      <ul className="tarjeta-comidas">
        {dia.comidas.map((datos) => (
          <li key={datos.comida}>
            <ComidaDeTarjeta
              dia={dia}
              datos={datos}
              abierta={abierta === datos.comida}
              idBurbuja={idBurbuja}
              diaAMedioCerrar={aMedioCerrar}
              alAbrir={() => alAbrir(datos.comida)}
              alCerrar={alCerrar}
              usuarioId={usuarioId}
              voz={voz}
              persona={persona}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * La semana de una persona en siete tarjetitas (DESIGN.md §8). Cada comida de cada tarjeta es un
 * botón: tocarlo abre, en una burbuja junto a él, las mismas opciones que en el Plan; una burbuja a
 * la vez. `diaAlEntrar`: la tarjeta que se trae a la vista al entrar (hoy en la semana en curso). En
 * La casa, el Director ve la de otra persona: `usuarioId` va a cada acción y los textos pasan a
 * tercera persona (`voz` 'ajena').
 */
export function SemanaPersona({
  dias,
  tipo,
  diaAlEntrar,
  hrefSiguienteSemana,
  usuarioId,
  voz = 'propia',
  persona,
}: {
  dias: DiaDeSemana[]
  tipo: TipoSemana
  diaAlEntrar: FechaISO | null
  /** Solo en la semana en curso: "mañana" nunca se esconde detrás de la paginación. */
  hrefSiguienteSemana: string | null
  usuarioId?: string
  voz?: Voz
  /** Nombre de la persona (La casa). */
  persona?: string
}) {
  const idBurbuja = `${useId()}-burbuja`
  const borradores = useBorradoresDelGrupo()
  const [abierta, setAbierta] = useState<{ fecha: FechaISO; comida: ComidaDeSemana['comida'] } | null>(null)
  const tarjetaAlEntrar = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!diaAlEntrar) return
    // En el cuadro siguiente: al navegar, Next.js lleva la página arriba después de montarla.
    const cuadro = requestAnimationFrame(() => revelarAlEntrar(tarjetaAlEntrar.current))
    return () => cancelAnimationFrame(cuadro)
    // Solo al montar: `key={lunes}` en la página vuelve a montar al cambiar de semana.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function abrir(fecha: FechaISO, comida: ComidaDeSemana['comida']) {
    // Pasar de una comida a otra guarda lo que quedó escrito en la abierta; si la nota no sirve, la
    // burbuja sigue abierta con el error a la vista.
    if (abierta && !borradores.confirmarTodos()) return
    setAbierta({ fecha, comida })
  }

  const ultimoDia = dias.at(-1)?.esHoy ?? false

  return (
    <>
      {tipo === 'pasada' && (
        <div className="locked-banner">Semana pasada: solo consulta. Podés cambiar la semana actual y la siguiente.</div>
      )}
      {tipo !== 'pasada' && <p className="hint semana-ayuda">Tocá una comida para cambiarla.</p>}
      {semanaCambiadaPorOtro(dias) && (
        <p className="leyenda-director">
          <span className="celda-director">
            <Icono nombre="editado" />
            Director
          </span>
          {voz === 'propia' ? '= la cambió el Director, no vos.' : '= la cambió un Director.'}
        </p>
      )}

      <div className="semana-marco">
        <ContextoBorradores value={borradores.registrar}>
          <div className="tarjetas-semana week-list">
            {dias.map((dia) => (
              <TarjetaDia
                key={dia.fecha}
                ref={dia.fecha === diaAlEntrar ? tarjetaAlEntrar : undefined}
                dia={dia}
                abierta={abierta?.fecha === dia.fecha ? abierta.comida : null}
                idBurbuja={idBurbuja}
                alAbrir={(comida) => abrir(dia.fecha, comida)}
                alCerrar={() => setAbierta(null)}
                usuarioId={usuarioId}
                voz={voz}
                persona={persona}
              />
            ))}
          </div>
        </ContextoBorradores>
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
