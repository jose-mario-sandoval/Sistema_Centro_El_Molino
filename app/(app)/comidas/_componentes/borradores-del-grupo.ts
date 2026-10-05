import { createContext, useCallback, useContext, useEffect, useRef } from 'react'

/** true si la comida puede cerrarse (guardó lo escrito o no tenía nada); false si quedó el error a la vista. */
type Confirmar = () => boolean

export const ContextoBorradores = createContext<(confirmar: Confirmar) => () => void>(() => () => {})

/**
 * Para quien tiene varias comidas y una sola burbuja abierta (la Semana, La casa): antes de pasar a
 * otra comida, la abierta guarda lo que quedó escrito o, si no sirve, avisa y la burbuja sigue
 * abierta. Nada escrito se pierde en silencio (DESIGN.md §8).
 */
export function useBorradoresDelGrupo() {
  const confirmadores = useRef(new Set<Confirmar>())
  const registrar = useCallback((confirmar: Confirmar) => {
    confirmadores.current.add(confirmar)
    return () => {
      confirmadores.current.delete(confirmar)
    }
  }, [])
  // Se detiene en la primera que no puede cerrarse (la de la burbuja abierta), que queda con el foco.
  const confirmarTodos = useCallback(() => {
    for (const confirmar of confirmadores.current) if (!confirmar()) return false
    return true
  }, [])
  return { registrar, confirmarTodos }
}

/** En cada comida del grupo: se anota para que le pregunten antes de cerrar. */
export function useAvisarAlGrupo(confirmar: Confirmar) {
  const registrar = useContext(ContextoBorradores)
  const ultimo = useRef(confirmar)
  useEffect(() => {
    ultimo.current = confirmar
  })
  useEffect(() => registrar(() => ultimo.current()), [registrar])
}
