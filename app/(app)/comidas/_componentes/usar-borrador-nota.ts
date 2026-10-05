import { useRef, useState } from 'react'
import { notaInicial, resolverBorrador, type Borrador } from '@/lib/comidas/notas'
import type { EstadoComida, ValorComida } from '@/lib/comidas/tipos'

export type BorradorNota = {
  /** Estado que pide nota elegido y todavía sin guardar (null = no se está escribiendo nada). */
  borrador: Borrador | null
  /** Por qué no se pudo guardar o cerrar; va debajo del campo. */
  error: string | null
  /** Para `EditorNota`: al quedar un error, el foco vuelve al campo. */
  campo: React.RefObject<HTMLInputElement | null>
  /** Elegir temprano, tarde o enfermo: abre el campo (temprano ↔ tarde traen la hora ya escrita). */
  elegir: (estado: EstadoComida) => void
  cambiar: (nota: string) => void
  /**
   * "Guardar" (alCerrar: false) o cerrar la burbuja (alCerrar: true: "Listo", volver a tocar la
   * comida, un toque fuera, pasar a otra). Guarda lo escrito si sirve; si no, muestra el error y
   * devuelve false: la burbuja tiene que quedar abierta.
   */
  confirmar: (opciones: { alCerrar: boolean }) => boolean
  /** Escape y "Cancelar": lo único que descarta lo escrito. */
  descartar: () => void
}

/** Las props de `EditorNota` a partir del borrador: así Plan y Semana lo conectan igual. */
export function propsEditorNota(nota: BorradorNota) {
  return {
    valor: nota.borrador?.nota ?? '',
    error: nota.error,
    campo: nota.campo,
    alCambiar: nota.cambiar,
    alGuardar: () => {
      nota.confirmar({ alCerrar: false })
    },
    alCancelar: nota.descartar,
  }
}

/**
 * La nota a medio escribir de una comida, con el mismo comportamiento en Plan, Semana y La casa
 * (DESIGN.md §8). Nada se guarda al salir del campo; nada escrito se pierde al cerrar.
 */
export function useBorradorNota(
  guardado: ValorComida | null,
  guardar: (valor: ValorComida) => void,
  /** 'ajena': el Director escribe la nota de otra persona (los errores en tercera persona). */
  voz: 'propia' | 'ajena' = 'propia',
): BorradorNota {
  const [borrador, setBorrador] = useState<Borrador | null>(null)
  const [error, setError] = useState<string | null>(null)
  const campo = useRef<HTMLInputElement>(null)

  return {
    borrador,
    error,
    campo,
    elegir(estado) {
      setBorrador({ estado, nota: notaInicial(borrador ?? guardado, estado) })
      setError(null)
    },
    cambiar(nota) {
      setBorrador((antes) => antes && { ...antes, nota })
      setError(null)
    },
    confirmar({ alCerrar }) {
      const decision = resolverBorrador(borrador, guardado, { alCerrar, voz })
      if (decision.tipo === 'error') {
        setError(decision.mensaje)
        campo.current?.focus()
        return false
      }
      if (decision.tipo === 'guardar') guardar(decision.valor)
      setBorrador(null)
      setError(null)
      return true
    },
    descartar() {
      setBorrador(null)
      setError(null)
    },
  }
}
