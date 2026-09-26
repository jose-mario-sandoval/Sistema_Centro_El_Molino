'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Icono } from '@/components/ui/iconos'
import { llamarAccion } from '@/lib/acciones/llamar'
import type { PaginaFeed } from '@/lib/mensajes/consulta-feed'
import {
  agregarAnteriores,
  aplicarBorradoMensaje,
  aplicarFijado,
  aplicarInsercionMensaje,
  fijarReaccion,
  publicaDirecto,
  tieneReaccion,
  type MensajeFila,
  type Publicacion,
} from '@/lib/mensajes/feed'
import { separarFijadas, type DuracionFijado } from '@/lib/mensajes/fijados'
import { aplicarCambios, type CambioFeed, type EventoLeido } from '@/lib/mensajes/tiempo-real'
import type { PerfilResumen } from '@/lib/perfiles/consultas'
import {
  alternarReaccion,
  borrarMensaje,
  cargarMensajes,
  cargarPerfiles,
  desfijarPublicacion,
  fijarPublicacion,
} from '../acciones'
import { ConfirmarBorrado } from './confirmar-borrado'
import { FormularioPublicar } from './formulario-publicar'
import { TarjetaMensaje, type PedidoBorrado, type UsuarioFeed } from './tarjeta-mensaje'
import { useCanalMensajes, type ResultadoRecarga } from './use-canal-mensajes'

function indexar(perfiles: PerfilResumen[]): Record<string, PerfilResumen> {
  return Object.fromEntries(perfiles.map((p) => [p.id, p]))
}

/**
 * Página cronológica más las fijadas, sin repetir. Una fijada puede ser más vieja que toda la página: por eso
 * el cursor de "Ver anteriores" viaja aparte (PaginaFeed.cursor) y no se saca de este arreglo.
 */
function conFijadas(pagina: PaginaFeed): Publicacion[] {
  return agregarAnteriores(pagina.publicaciones, pagina.fijadas)
}

export function FeedMensajes({
  inicial,
  perfiles: perfilesIniciales,
  usuario,
  generadoEn,
}: {
  inicial: PaginaFeed
  perfiles: PerfilResumen[]
  usuario: UsuarioFeed
  generadoEn: string
}) {
  const aviso = useAviso()
  const [publicaciones, setPublicaciones] = useState(() => conFijadas(inicial))
  const [hayMas, setHayMas] = useState(inicial.hayMas)
  const [cursor, setCursor] = useState(inicial.cursor)
  const [perfiles, setPerfiles] = useState(() => indexar(perfilesIniciales))
  const [ahora, setAhora] = useState(() => new Date(generadoEn))
  const [pedidoBorrado, setPedidoBorrado] = useState<PedidoBorrado | null>(null)
  const [borrando, iniciarBorrado] = useTransition()
  const [cargandoAnteriores, iniciarCargaAnteriores] = useTransition()
  const recargandoPerfiles = useRef(false)
  /** Sube al empezar y al terminar cada recarga completa: invalida un "Ver anteriores" pedido sobre el feed viejo. */
  const generacion = useRef(0)
  /** Cambios (eventos y optimistas) llegados durante una recarga completa; null si no hay recarga en curso. */
  const cambiosEnRecarga = useRef<CambioFeed[] | null>(null)
  const avisoRecargaMostrado = useRef(false)
  /** Publicación que cambió de sección (fijar/quitar): recibe el foco al volver a pintar, para no perderlo. */
  const enfocarDespues = useRef<string | null>(null)
  const idTituloFijados = useId()
  const idTituloPublicaciones = useId()

  // "hace cuánto" y el vencimiento de las fijadas se actualizan cada minuto.
  useEffect(() => {
    const reloj = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(reloj)
  }, [])

  // La tarjeta fijada o quitada se vuelve a montar en la otra sección: el foco va a ella (y la trae a la vista).
  useEffect(() => {
    const id = enfocarDespues.current
    if (!id) return
    enfocarDespues.current = null
    document.querySelector<HTMLElement>(`article[data-mensaje-id="${CSS.escape(id)}"]`)?.focus()
  })

  /** Todo cambio local del feed pasa por acá, para no perderlo si una recarga en curso reemplaza los datos. */
  function aplicar(cambio: CambioFeed) {
    cambiosEnRecarga.current?.push(cambio)
    setPublicaciones(cambio)
  }

  async function recargarPerfiles() {
    if (recargandoPerfiles.current) return
    recargandoPerfiles.current = true
    const resultado = await llamarAccion(cargarPerfiles)
    recargandoPerfiles.current = false
    if (resultado.ok) setPerfiles(indexar(resultado.data))
  }

  async function recargarTodo(): Promise<ResultadoRecarga> {
    const esta = ++generacion.current
    cambiosEnRecarga.current ??= []
    const [mensajes, listaPerfiles] = await Promise.all([
      llamarAccion(() => cargarMensajes({ antesDe: null })),
      llamarAccion(cargarPerfiles),
    ])
    // Empezó otra recarga: esa se queda con los cambios acumulados y aplica sus datos, más nuevos.
    if (esta !== generacion.current) return 'descartada'

    if (listaPerfiles.ok) setPerfiles(indexar(listaPerfiles.data))
    const cambios = cambiosEnRecarga.current ?? []
    cambiosEnRecarga.current = null
    if (!mensajes.ok) {
      // Los cambios ya están aplicados sobre el feed actual; el indicador sigue en "Reconectando…" y se reintenta.
      if (!avisoRecargaMostrado.current) aviso(mensajes.error)
      avisoRecargaMostrado.current = true
      return 'fallo'
    }
    avisoRecargaMostrado.current = false
    generacion.current++
    // Los cambios son idempotentes: lo que la recarga ya trae no se duplica.
    setPublicaciones(aplicarCambios(conFijadas(mensajes.data), cambios))
    setHayMas(mensajes.data.hayMas)
    setCursor(mensajes.data.cursor)
    return 'ok'
  }

  function alEvento({ cambio, autorId, publicacionFijada }: EventoLeido) {
    aplicar(cambio)
    if (autorId && !perfiles[autorId]) void recargarPerfiles()
    // Alguien fijó una publicación que esta página no tiene (una vieja): se trae completa, con sus reacciones
    // y respuestas, en vez de mostrarla a medias.
    if (publicacionFijada && !publicaciones.some((p) => p.id === publicacionFijada)) void recargarTodo()
  }

  const conexion = useCanalMensajes({ alEvento, recargar: recargarTodo })

  function agregarPropio(id: string, texto: string, padreId: string | null) {
    const fila: MensajeFila = {
      id,
      autor_id: usuario.id,
      padre_id: padreId,
      texto,
      creado_en: new Date().toISOString(),
      // Provisorio: el servidor decide (mensajes_forzar_estado) y el evento de tiempo real lo confirma.
      // Fijarlo en 'aprobado' acá haría que un Residente vea su propio mensaje aprobado por un instante.
      estado: publicaDirecto(usuario.rol) ? 'aprobado' : 'pendiente',
      motivo_rechazo: null,
      fijado_en: null,
      fijado_hasta: null,
      fijado_por: null,
    }
    aplicar((feed) => aplicarInsercionMensaje(feed, fila))
  }

  async function reaccionar(mensajeId: string) {
    // Estado final fijo (no "alternar") para que el cambio sea idempotente si se vuelve a aplicar.
    const presente = !tieneReaccion(publicaciones, mensajeId, usuario.id)
    aplicar((feed) => fijarReaccion(feed, mensajeId, usuario.id, presente))
    const resultado = await llamarAccion(() => alternarReaccion({ mensajeId, presente }))
    if (!resultado.ok) {
      aplicar((feed) => fijarReaccion(feed, mensajeId, usuario.id, !presente))
      aviso(resultado.error)
    }
  }

  async function fijar(id: string, duracion: DuracionFijado, fecha?: string) {
    const resultado = await llamarAccion(() => fijarPublicacion({ id, duracion, fecha }))
    if (resultado.ok) {
      aplicar((feed) => aplicarFijado(feed, id, resultado.data))
      enfocarDespues.current = id
      aviso('Publicación fijada arriba.')
    } else if (!resultado.campos?.fecha) {
      // El error de la fecha lo muestra el panel junto al campo.
      aviso(resultado.error)
    }
    return resultado
  }

  async function desfijar(id: string) {
    const resultado = await llamarAccion(() => desfijarPublicacion({ id }))
    if (!resultado.ok) {
      aviso(resultado.error)
      return
    }
    aplicar((feed) => aplicarFijado(feed, id, null))
    enfocarDespues.current = id
    aviso('Se quitó de fijados.')
  }

  function verAnteriores() {
    const antesDe = cursor
    const generacionPedida = generacion.current
    iniciarCargaAnteriores(async () => {
      const resultado = await llamarAccion(() => cargarMensajes({ antesDe }))
      // Una recarga completa reemplazó el feed mientras tanto: el cursor ya no corresponde y quedaría un hueco.
      if (generacionPedida !== generacion.current) return
      if (!resultado.ok) {
        aviso(resultado.error)
        return
      }
      setPublicaciones((feed) => agregarAnteriores(feed, resultado.data.publicaciones))
      setHayMas(resultado.data.hayMas)
      if (resultado.data.cursor) setCursor(resultado.data.cursor)
    })
  }

  function confirmarBorrado() {
    if (!pedidoBorrado) return
    const { id } = pedidoBorrado
    iniciarBorrado(async () => {
      const resultado = await llamarAccion(() => borrarMensaje({ id }))
      // Con Escape se puede cerrar el diálogo y abrir otro mientras tanto: ese no se toca.
      setPedidoBorrado((actual) => (actual?.id === id ? null : actual))
      if (!resultado.ok) {
        aviso(resultado.error)
        return
      }
      aplicar((feed) => aplicarBorradoMensaje(feed, id))
      aviso('Mensaje eliminado.')
    })
  }

  const { fijadas, resto } = separarFijadas(publicaciones, ahora)
  const tarjeta = (p: Publicacion) => (
    <TarjetaMensaje
      key={p.id}
      publicacion={p}
      perfiles={perfiles}
      usuario={usuario}
      ahora={ahora}
      alReaccionar={(mensajeId) => void reaccionar(mensajeId)}
      alResponder={(padreId, id, texto) => agregarPropio(id, texto, padreId)}
      alPedirBorrado={setPedidoBorrado}
      alFijar={fijar}
      alDesfijar={desfijar}
    />
  )

  return (
    <div className="feed-mensajes" data-conexion={conexion}>
      <FormularioPublicar alPublicar={(id, texto) => agregarPropio(id, texto, null)} />

      <div role="status" aria-live="polite" style={{ marginBottom: conexion === 'reconectando' ? 12 : 0 }}>
        {conexion === 'reconectando' && <span className="role-pill">Reconectando…</span>}
      </div>

      {/* Una fijada vigente aparece solo acá, no repetida en la lista por fecha. */}
      {fijadas.length > 0 && (
        <section className="seccion-fijados" aria-labelledby={idTituloFijados}>
          <h2 id={idTituloFijados} className="titulo-feed">
            <Icono nombre="fijar" />
            Fijados
          </h2>
          <div className="feed">{fijadas.map(tarjeta)}</div>
        </section>
      )}

      {fijadas.length === 0 ? (
        <div className="feed">
          {resto.length === 0 ? (
            <div className="empty-state">Todavía no hay publicaciones. Sé el primero en escribir algo.</div>
          ) : (
            resto.map(tarjeta)
          )}
        </div>
      ) : (
        resto.length > 0 && (
          <section aria-labelledby={idTituloPublicaciones}>
            <h2 id={idTituloPublicaciones} className="titulo-feed">
              Publicaciones
            </h2>
            <div className="feed">{resto.map(tarjeta)}</div>
          </section>
        )
      )}

      {hayMas && (
        <div className="compose-foot" style={{ justifyContent: 'center', marginTop: 16 }}>
          <button type="button" className="btn ghost small" onClick={verAnteriores} disabled={cargandoAnteriores}>
            {cargandoAnteriores ? 'Cargando…' : 'Ver anteriores'}
          </button>
        </div>
      )}

      <ConfirmarBorrado
        pedido={pedidoBorrado}
        nombreAutor={pedidoBorrado ? (perfiles[pedidoBorrado.autorId]?.nombre ?? 'otra persona') : ''}
        esPropio={pedidoBorrado?.autorId === usuario.id}
        pendiente={borrando}
        alConfirmar={confirmarBorrado}
        alCerrar={() => setPedidoBorrado(null)}
      />
    </div>
  )
}
