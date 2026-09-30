'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import {
  alternarFiltro,
  CLAVE_FILTROS,
  crearAlmacenOcultos,
  escribirOcultos,
  leerOcultos,
  type Filtro,
} from '@/lib/calendario/filtros'

const almacen = crearAlmacenOcultos(() => window.localStorage)

function suscribir(avisar: () => void) {
  const dejar = almacen.suscribir(avisar)
  // Cambió en otra pestaña (o se borró todo el almacenamiento: key null): se repinta también esta.
  const deOtraPestana = (e: StorageEvent) => {
    if (e.key === CLAVE_FILTROS) almacen.desdeOtraPestana(e.newValue)
    else if (e.key === null) almacen.desdeOtraPestana(null)
  }
  window.addEventListener('storage', deOtraPestana)
  return () => {
    dejar()
    window.removeEventListener('storage', deOtraPestana)
  }
}

/** En el servidor (y al hidratar) no hay dispositivo: null = "todavía no se sabe", se pinta todo a la vista. */
const sinDispositivo = () => null

/**
 * Los filtros del calendario de este dispositivo. `listo` es false mientras React hidrata el HTML del
 * servidor (que siempre muestra todo); en ese momento el CSS esconde lo guardado a partir del
 * atributo que puso el script previo al pintado (SCRIPT_FILTROS_CALENDARIO), así nada salta.
 *
 * `activos` = false (Administración): sin filtros, nunca se oculta nada.
 */
export function useFiltrosCalendario(activos: boolean) {
  const texto = useSyncExternalStore(suscribir, almacen.leer, sinDispositivo)
  const ocultos = useMemo<Filtro[]>(() => (activos ? leerOcultos(texto) : []), [activos, texto])
  const alternar = useCallback((filtro: Filtro) => {
    almacen.guardar(escribirOcultos(alternarFiltro(leerOcultos(almacen.leer()), filtro)))
  }, [])
  const mostrarTodo = useCallback(() => almacen.guardar(escribirOcultos([])), [])
  return { ocultos, listo: texto !== null, alternar, mostrarTodo }
}
