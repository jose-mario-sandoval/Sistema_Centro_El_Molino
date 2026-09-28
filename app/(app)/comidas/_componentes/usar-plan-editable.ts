import { useRef, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { cambiadasPorOtro, celdasDesdePlan, claveCelda, conCelda, hayQueGuardar, mensajeFalloCelda } from '@/lib/comidas/plan'
import type { TiempoComida, ValorComida } from '@/lib/comidas/tipos'
import type { PlanSemanal } from '@/lib/comidas/vista'
import { guardarPlan } from '../acciones'

export type PlanEditableEstado = {
  /** Lo que muestra la celda: lo guardado, o lo último elegido mientras se guarda. null = sin definir. */
  valor: (dia: number, comida: TiempoComida) => ValorComida | null
  /** Hay un guardado en curso para esa celda. */
  pendiente: (dia: number, comida: TiempoComida) => boolean
  /** Muestra `nuevo` enseguida y lo guarda; si falla (y no se eligió otra cosa después), vuelve atrás. */
  guardar: (dia: number, comida: TiempoComida, nuevo: ValorComida | null) => void
  /** La celda la cambió otra persona (el Director): "la cambió el Director". */
  cambiadaPorOtro: (dia: number, comida: TiempoComida) => boolean
}

/**
 * Estado y guardado de las 21 celdas del plan semanal, cada una con su propia reversión. Con
 * `usuarioId`, el plan de otra persona (La casa del Director); `porOtro` dice si quien guarda es
 * otra persona, para marcar la celda como "la cambió el Director" igual que modificado_por.
 */
export function usePlanEditable(
  inicial: PlanSemanal,
  { usuarioId, porOtro = false }: { usuarioId?: string; porOtro?: boolean } = {},
): PlanEditableEstado {
  const aviso = useAviso()
  const [iniciales] = useState(() => celdasDesdePlan(inicial))
  const [marcasIniciales] = useState(() => cambiadasPorOtro(inicial))
  const [celdas, setCeldas] = useState(iniciales)
  const [marcas, setMarcas] = useState<Record<string, boolean>>(marcasIniciales)
  const [enCurso, setEnCurso] = useState<Record<string, number>>({})
  const [, iniciar] = useTransition()
  // Refs (no estado) porque solo se leen al guardar, también desde guardados que terminan después.
  // confirmado = último valor que aceptó el servidor; pedido = último valor enviado (o confirmado).
  const confirmado = useRef(new Map<string, ValorComida | null>())
  // Si la celda confirmada la cambió otra persona (para volver atrás también la marca).
  const marcaConfirmada = useRef(new Map<string, boolean>())
  const pedido = useRef(new Map<string, ValorComida | null>())
  // Número del último guardado iniciado en cada celda: una falla solo revierte si no hubo otro después.
  const ultimoGuardado = useRef(new Map<string, number>())

  function leer(mapa: Map<string, ValorComida | null>, clave: string): ValorComida | null {
    return mapa.has(clave) ? (mapa.get(clave) ?? null) : (iniciales[clave] ?? null)
  }

  function guardar(dia: number, comida: TiempoComida, nuevo: ValorComida | null) {
    const clave = claveCelda(dia, comida)
    // Se compara con lo último pedido: si hay un guardado en curso, volver al valor anterior también se guarda.
    if (!hayQueGuardar(leer(pedido.current, clave), nuevo)) return

    pedido.current.set(clave, nuevo)
    const numero = (ultimoGuardado.current.get(clave) ?? 0) + 1
    ultimoGuardado.current.set(clave, numero)
    setCeldas((antes) => conCelda(antes, clave, nuevo))
    // Una celda sin definir no tiene fila: nadie "la cambió".
    const marca = porOtro && nuevo !== null
    setMarcas((antes) => ({ ...antes, [clave]: marca }))
    setEnCurso((antes) => ({ ...antes, [clave]: (antes[clave] ?? 0) + 1 }))

    iniciar(async () => {
      let resultado: Resultado<null>
      try {
        resultado = await guardarPlan({
          diaSemana: dia,
          comida,
          estado: nuevo?.estado ?? null,
          nota: nuevo?.nota ?? null,
          usuarioId,
        })
      } catch {
        // Sin conexión o error inesperado: aviso y se revierte, sin pasar a la pantalla de error (spec §9.1).
        resultado = fallo('No se pudo guardar. Revisá tu conexión e intentá de nuevo.')
      }
      setEnCurso((antes) => ({ ...antes, [clave]: Math.max(0, (antes[clave] ?? 1) - 1) }))
      if (resultado.ok) {
        confirmado.current.set(clave, nuevo)
        marcaConfirmada.current.set(clave, marca)
        aviso('Plan semanal actualizado')
        return
      }
      // Dice qué celda vuelve atrás: la burbuja pudo haberse cerrado o estar en otra.
      aviso(mensajeFalloCelda(dia, comida, resultado.error))
      // Si la persona ya eligió otra cosa después, no pisamos esa elección con el valor anterior.
      if (numero !== ultimoGuardado.current.get(clave)) return
      const anterior = leer(confirmado.current, clave)
      pedido.current.set(clave, anterior)
      setCeldas((antes) => conCelda(antes, clave, anterior))
      const marcaAnterior = marcaConfirmada.current.has(clave)
        ? (marcaConfirmada.current.get(clave) ?? false)
        : Boolean(marcasIniciales[clave])
      setMarcas((antes) => ({ ...antes, [clave]: marcaAnterior }))
    })
  }

  return {
    valor: (dia, comida) => celdas[claveCelda(dia, comida)] ?? null,
    pendiente: (dia, comida) => (enCurso[claveCelda(dia, comida)] ?? 0) > 0,
    guardar,
    cambiadaPorOtro: (dia, comida) => Boolean(marcas[claveCelda(dia, comida)]),
  }
}
