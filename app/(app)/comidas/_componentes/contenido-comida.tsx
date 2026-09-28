'use client'

import { Icono } from '@/components/ui/iconos'
import { ETIQUETA_TIEMPO, INFO_ESTADO, type TiempoComida } from '@/lib/comidas/tipos'
import type { ComidaDeSemana } from '@/lib/comidas/vista'
import { etiquetaNota, etiquetaOpciones, preguntaComida, textoOrigen, textoVolver, type Voz } from '@/lib/comidas/voz'
import { EditorNota } from './editor-nota'
import { InsigniaEstado, textoNota } from './insignia-estado'
import { PanelOpciones } from './panel-opciones'
import { propsEditorNota } from './usar-borrador-nota'
import type { ComidaDelDia } from './usar-comida-del-dia'

const ARTICULO: Record<TiempoComida, string> = { desayuno: 'el', almuerzo: 'el', cena: 'la' }

/** 'cierra hoy 10:00' → 'Cierra hoy 10:00' */
function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

/**
 * Lo que va dentro de la burbuja de una comida de un día (Semana y La casa): el título, de dónde
 * viene lo que rige ("según tu plan", "la cambió el Director"…), hasta cuándo se puede cambiar, las
 * seis opciones con la pregunta, el campo de la hora o la nota, "Volver a mi plan" y "Listo". Si ya
 * cerró, solo se lee: lo que quedó, con candado y el motivo escrito.
 */
export function ContenidoComida({
  tituloId,
  titulo,
  dia,
  datos,
  comida,
  voz = 'propia',
  persona,
  alListo,
  pie,
}: {
  tituloId: string
  /** 'Almuerzo del miércoles 23/9' */
  titulo: string
  /** 'Miércoles' */
  dia: string
  datos: ComidaDeSemana
  comida: ComidaDelDia
  voz?: Voz
  /** Nombre de la persona (La casa): "Elegí qué hace Juan con el almuerzo". */
  persona?: string
  alListo: () => void
  /** Al final de la burbuja (La casa: "Ver la semana de Juan"). */
  pie?: React.ReactNode
}) {
  const { valor, pendiente, editable, nota } = comida
  const nombre = ETIQUETA_TIEMPO[datos.comida]
  const borrador = editable ? nota.borrador : null
  const tipoNota = borrador ? INFO_ESTADO[borrador.estado].nota : null

  return (
    <>
      <div className="burbuja-cabeza">
        <h2 id={tituloId} className="burbuja-titulo">
          {titulo}
        </h2>
        {/* "la cambió el Director" cuando fue él (modificado_por): la persona tiene que saberlo. */}
        {valor && <span className={`origen${valor.origen === 'persona' ? ' cambiada' : ''}`}>{textoOrigen(valor, voz)}</span>}
        {editable && <span className="burbuja-cierre">{conMayuscula(datos.cierre)}</span>}
      </div>

      {editable ? (
        <>
          <PanelOpciones
            nombre={nombre}
            etiquetaGrupo={
              voz === 'ajena' ? etiquetaOpciones(`${ARTICULO[datos.comida]} ${nombre.toLowerCase()}`, voz, persona) : undefined
            }
            titulo={preguntaComida(datos.comida, dia, voz)}
            marcado={borrador?.estado ?? valor?.estado ?? null}
            pendiente={pendiente}
            alElegir={comida.elegir}
            alListo={alListo}
            editorNota={
              borrador ? (
                <EditorNota
                  key={borrador.estado}
                  estado={borrador.estado}
                  etiqueta={tipoNota ? etiquetaNota(tipoNota, voz) : undefined}
                  {...propsEditorNota(nota)}
                  pendiente={pendiente}
                />
              ) : (
                valor?.nota && (
                  <p className="nota-comida">
                    <Icono nombre={valor.estado} />
                    <span>{textoNota(valor.estado, valor.nota)}</span>
                  </p>
                )
              )
            }
            acciones={
              !borrador &&
              valor?.origen === 'persona' && (
                <button
                  type="button"
                  className="btn ghost"
                  disabled={pendiente}
                  onClick={(e) => {
                    // El botón desaparece al volver: el foco queda en la burbuja, nunca en la nada.
                    e.currentTarget.closest<HTMLElement>('.burbuja')?.focus({ preventScroll: true })
                    comida.volver()
                  }}
                >
                  {textoVolver(datos.ausente, voz)}
                </button>
              )
            }
          />
        </>
      ) : (
        <>
          <div className="burbuja-valor">
            <InsigniaEstado valor={valor} />
          </div>
          <p className="motivo-cierre">
            <Icono nombre="candado" />
            <span>Cerrada: ya no se puede cambiar.</span>
          </p>
          <div className="burbuja-pie">
            <button type="button" className="btn ghost" onClick={alListo}>
              Listo
            </button>
          </div>
        </>
      )}
      {pie}
    </>
  )
}
