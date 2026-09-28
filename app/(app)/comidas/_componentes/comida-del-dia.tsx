'use client'

import { useOptimistic, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { VALOR_POR_AUSENCIA } from '@/lib/comidas/reglas'
import {
  ETIQUETA_TIEMPO,
  INFO_ESTADO,
  type EstadoComida,
  type TiempoComida,
  type ValorComida,
  type ValorEfectivo,
} from '@/lib/comidas/tipos'
import { valorTrasGuardar, type ComidaDeSemana } from '@/lib/comidas/vista'
import type { FechaISO } from '@/lib/fechas'
import { guardarSeleccion, volverAPlan } from '../acciones'
import { useAvisarAlGrupo } from './borradores-del-grupo'
import { EditorNota } from './editor-nota'
import { textoNota } from './insignia-estado'
import { SelectorComida } from './selector-comida'
import { propsEditorNota, useBorradorNota } from './usar-borrador-nota'

const VERBO: Record<TiempoComida, string> = { desayuno: 'desayunar', almuerzo: 'almorzar', cena: 'cenar' }

/** 'cierra hoy 10:00' → 'Cierra hoy 10:00' */
function conMayuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function ComidaDelDia({
  fecha,
  dia,
  etiquetaDia,
  datos,
}: {
  fecha: FechaISO
  /** 'Miércoles' */
  dia: string
  /** 'Miércoles 23/9' */
  etiquetaDia: string
  datos: ComidaDeSemana
}) {
  const aviso = useAviso()
  const [valor, aplicarValor] = useOptimistic(datos.valor)
  const [pendiente, iniciar] = useTransition()
  const nota = useBorradorNota(valor, guardar)

  const nombre = ETIQUETA_TIEMPO[datos.comida]
  const editable = datos.abierta
  const borrador = editable ? nota.borrador : null
  const estadoMarcado = borrador?.estado ?? valor?.estado ?? null

  // Cerrar el día (o pasar a otro) con una nota a medio escribir la guarda, o avisa y no cierra.
  useAvisarAlGrupo(() => !editable || nota.confirmar({ alCerrar: true }))

  function ejecutar(optimista: ValorEfectivo, accion: () => Promise<Resultado<null>>) {
    iniciar(async () => {
      aplicarValor(optimista)
      let resultado: Resultado<null>
      try {
        resultado = await accion()
      } catch {
        // Sin conexión o error inesperado: aviso y se revierte, sin pasar a la pantalla de error (spec §9.1).
        resultado = fallo('No se pudo guardar. Revisá tu conexión e intentá de nuevo.')
      }
      // No hace falta router.refresh(): la acción revalida /comidas al guardar y también ante MOL01
      // (la ventana cerró mientras la página estaba abierta), y su respuesta ya trae la vista real
      // (spec §6.4). Al terminar la transición, el valor optimista se reemplaza por ese estado.
      if (!resultado.ok) aviso(resultado.error)
    })
  }

  function guardar(nuevo: ValorComida) {
    ejecutar(valorTrasGuardar(datos.plan, nuevo, datos.ausente), () =>
      guardarSeleccion({ fecha, comida: datos.comida, estado: nuevo.estado, nota: nuevo.nota }),
    )
  }

  function elegir(estado: EstadoComida) {
    // Mientras se guarda, los chips siguen enfocables (aria-disabled) pero ignoran los clics.
    if (pendiente) return
    if (INFO_ESTADO[estado].nota) {
      nota.elegir(estado)
      return
    }
    nota.descartar()
    if (valor?.estado === estado) return
    guardar({ estado, nota: null })
  }

  function volver() {
    // Volver a la referencia: si está ausente ese día, "No comer" por la ausencia; si no, su plan.
    ejecutar(datos.ausente ? VALOR_POR_AUSENCIA : datos.plan ? { ...datos.plan, origen: 'plan' } : null, () =>
      volverAPlan({ fecha, comida: datos.comida }),
    )
  }

  return (
    <div
      className="comida-fila"
      role="group"
      aria-label={`${nombre}, ${etiquetaDia}`}
      data-fecha={fecha}
      data-comida={datos.comida}
    >
      <SelectorComida
        nombre={nombre}
        estado={valor?.estado ?? null}
        marcado={estadoMarcado}
        pregunta={`¿Vas a ${VERBO[datos.comida]} el ${dia.toLowerCase()}?`}
        origen={valor ? { texto: textoOrigen(valor), cambiada: valor.origen === 'persona' } : null}
        nota={!borrador && valor?.nota ? textoNota(valor.estado, valor.nota) : null}
        cierre={editable ? conMayuscula(datos.cierre) : null}
        cerrada={editable ? null : 'Cerrada: ya no se puede cambiar.'}
        pendiente={pendiente}
        editorAbierto={borrador !== null}
        alElegir={elegir}
        // "Listo" o volver a tocar el estado guardan lo escrito (o avisan y no cierran); Escape descarta.
        alCerrar={(motivo) => {
          if (motivo === 'escape') {
            nota.descartar()
            return true
          }
          return nota.confirmar({ alCerrar: true })
        }}
        editorNota={
          borrador && (
            <EditorNota key={borrador.estado} estado={borrador.estado} {...propsEditorNota(nota)} pendiente={pendiente} />
          )
        }
        acciones={
          !borrador &&
          valor?.origen === 'persona' && (
            <button type="button" className="btn ghost" disabled={pendiente} onClick={volver}>
              {datos.ausente ? 'Volver a mi ausencia' : 'Volver a mi plan'}
            </button>
          )
        }
      />
    </div>
  )
}

function textoOrigen(valor: NonNullable<ValorEfectivo>): string {
  if (valor.origen === 'persona') return 'cambiada'
  return valor.origen === 'ausencia' ? 'por tu ausencia' : 'según tu plan'
}
