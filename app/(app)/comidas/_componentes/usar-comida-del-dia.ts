import { useOptimistic, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import type { MotivoCierre } from '@/components/ui/burbuja'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { VALOR_POR_AUSENCIA } from '@/lib/comidas/reglas'
import { INFO_ESTADO, type EstadoComida, type ValorComida, type ValorEfectivo } from '@/lib/comidas/tipos'
import { valorTrasGuardar, type ComidaDeSemana } from '@/lib/comidas/vista'
import type { Voz } from '@/lib/comidas/voz'
import type { FechaISO } from '@/lib/fechas'
import { guardarSeleccion, volverAPlan } from '../acciones'
import { useAvisarAlGrupo } from './borradores-del-grupo'
import { useBorradorNota, type BorradorNota } from './usar-borrador-nota'

export type ComidaDelDia = {
  /** Lo que rige: lo guardado, o lo recién elegido mientras se guarda. */
  valor: ValorEfectivo
  pendiente: boolean
  /** Se puede cambiar (no cerró). */
  editable: boolean
  nota: BorradorNota
  elegir: (estado: EstadoComida) => void
  /** Borra la excepción: vuelve al plan, o a "No comer" si está ausente ese día. */
  volver: () => void
  /**
   * Antes de cerrar su burbuja: Escape descarta lo escrito; todo lo demás lo guarda si sirve. false =
   * la nota no sirve, el error quedó a la vista y la burbuja tiene que seguir abierta.
   */
  soltar: (motivo: MotivoCierre) => boolean
}

/**
 * Una comida de un día: la de la propia persona (Semana) o, en La casa, la de otra persona que ve el
 * Director (`usuarioId` + voz 'ajena'). Guarda con valor optimista (el botón de la tarjeta ya muestra
 * lo elegido mientras se guarda) y con los mismos cierres para todos: lo cerrado no se toca.
 */
export function useComidaDelDia({
  fecha,
  datos,
  usuarioId,
  voz = 'propia',
}: {
  fecha: FechaISO
  datos: ComidaDeSemana
  /** De quién es la comida; sin él, de quien tiene la sesión. */
  usuarioId?: string
  voz?: Voz
}): ComidaDelDia {
  const aviso = useAviso()
  const [valor, aplicarValor] = useOptimistic(datos.valor)
  const [pendiente, iniciar] = useTransition()
  const nota = useBorradorNota(valor, guardar, voz)
  const editable = datos.abierta

  // Pasar a otra comida (u otra burbuja) con una nota a medio escribir la guarda, o avisa y no cambia.
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
    // Si guarda otra persona (el Director), la excepción queda como "la cambió el Director".
    ejecutar(valorTrasGuardar(datos.plan, nuevo, datos.ausente, voz === 'ajena'), () =>
      guardarSeleccion({ fecha, comida: datos.comida, estado: nuevo.estado, nota: nuevo.nota, usuarioId }),
    )
  }

  function elegir(estado: EstadoComida) {
    // Mientras se guarda, las opciones siguen enfocables (aria-disabled) pero ignoran los toques.
    if (pendiente || !editable) return
    if (INFO_ESTADO[estado].nota) {
      nota.elegir(estado)
      return
    }
    nota.descartar()
    if (valor?.estado === estado) return
    guardar({ estado, nota: null })
  }

  function volver() {
    if (!editable) return
    // Volver a la referencia: si está ausente ese día, "No comer" por la ausencia; si no, su plan.
    ejecutar(datos.ausente ? VALOR_POR_AUSENCIA : datos.plan ? { ...datos.plan, origen: 'plan' } : null, () =>
      volverAPlan({ fecha, comida: datos.comida, usuarioId }),
    )
  }

  function soltar(motivo: MotivoCierre): boolean {
    if (!editable) return true
    if (motivo === 'escape') {
      nota.descartar()
      return true
    }
    return nota.confirmar({ alCerrar: true })
  }

  return { valor, pendiente, editable, nota, elegir, volver, soltar }
}
