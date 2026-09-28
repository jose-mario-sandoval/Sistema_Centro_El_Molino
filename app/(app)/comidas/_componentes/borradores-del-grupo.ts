import { createContext, useCallback, useContext, useEffect, useRef } from 'react'

/** true si la comida puede cerrarse (guardó lo escrito o no tenía nada); false si quedó el error a la vista. */
type Confirmar = () => boolean

export const ContextoBorradores = createContext<(confirmar: Confirmar) => () => void>(() => () => {})

/**
 * Para quien cierra varias comidas a la vez (el panel de un día de la Semana): antes de cerrar o de
 * pasar a otro día, cada comida guarda lo que quedó escrito o, si no sirve, avisa y el panel sigue
 * abierto. Nada escrito se pierde en silencio (DESIGN.md §8).
 */
export function useBorradoresDelGrupo() {
  const confirmadores = useRef(new Set<Confirmar>())
  const registrar = useCallback((confirmar: Confirmar) => {
    confirmadores.current.add(confirmar)
    return () => {
      confirmadores.current.delete(confirmar)
    }
  }, [])
  // En orden (desayuno, almuerzo, cena); se detiene en la primera que no puede cerrarse, que queda con el foco.
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
