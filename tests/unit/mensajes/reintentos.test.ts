import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  crearReintento,
  ESPERA_INICIAL_MS,
  ESPERA_MAXIMA_MS,
  esperaReintento,
  FALLOS_ANTES_DE_REFRESCAR,
  RACHA_INICIAL,
  registrarFallo,
  type RachaFallos,
} from '@/lib/mensajes/reintentos'

describe('esperaReintento', () => {
  const alMedio = () => 0.5

  it('empieza en 3 s y se duplica en cada intento', () => {
    expect(ESPERA_INICIAL_MS).toBe(3_000)
    expect([0, 1, 2, 3, 4].map((i) => esperaReintento(i, alMedio))).toEqual([3_000, 6_000, 12_000, 24_000, 48_000])
  })

  it('nunca supera los 5 minutos, ni con muchos intentos ni con el azar al máximo', () => {
    expect(ESPERA_MAXIMA_MS).toBe(300_000)
    expect(esperaReintento(7, alMedio)).toBe(ESPERA_MAXIMA_MS)
    expect(esperaReintento(1_000, alMedio)).toBe(ESPERA_MAXIMA_MS)
    expect(esperaReintento(1_000, () => 0.999)).toBe(ESPERA_MAXIMA_MS)
  })

  it('agrega ±20 % de azar', () => {
    expect(esperaReintento(0, () => 0)).toBe(2_400)
    expect(esperaReintento(0, () => 1)).toBe(3_600)
    expect(esperaReintento(20, () => 0)).toBe(240_000)
    for (let i = 0; i < 50; i++) {
      const espera = esperaReintento(2)
      expect(espera).toBeGreaterThanOrEqual(9_600)
      expect(espera).toBeLessThanOrEqual(14_400)
    }
  })

  it('un intento negativo cuenta como el primero', () => {
    expect(esperaReintento(-3, alMedio)).toBe(ESPERA_INICIAL_MS)
  })
})

describe('registrarFallo', () => {
  function fallar(racha: RachaFallos, veces: number, enLinea = true) {
    const refrescos: boolean[] = []
    for (let i = 0; i < veces; i++) {
      const r = registrarFallo(racha, enLinea)
      racha = r.racha
      refrescos.push(r.refrescar)
    }
    return { racha, refrescos }
  }

  it('pide refrescar una sola vez, al tercer fallo seguido con red', () => {
    expect(FALLOS_ANTES_DE_REFRESCAR).toBe(3)
    const { refrescos, racha } = fallar(RACHA_INICIAL, 6)
    expect(refrescos).toEqual([false, false, true, false, false, false])
    expect(racha).toEqual({ fallos: 6, refrescado: true })
  })

  it('sin red los fallos no cuentan', () => {
    const { racha, refrescos } = fallar(RACHA_INICIAL, 5, false)
    expect(racha).toBe(RACHA_INICIAL)
    expect(refrescos.every((r) => !r)).toBe(true)

    const conDos = fallar(RACHA_INICIAL, 2).racha
    expect(fallar(conDos, 3, false).racha).toBe(conDos)
    expect(registrarFallo(conDos, true).refrescar).toBe(true)
  })

  it('una racha nueva (tras sincronizar bien) puede volver a refrescar', () => {
    expect(fallar(RACHA_INICIAL, 3).refrescos.at(-1)).toBe(true)
    expect(fallar(RACHA_INICIAL, 3).refrescos.at(-1)).toBe(true)
  })
})

describe('crearReintento', () => {
  let oculta = false
  const accion = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    oculta = false
    accion.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('corre la acción al vencer la espera', () => {
    const reintento = crearReintento(accion, () => oculta)
    reintento.programar(3_000)
    vi.advanceTimersByTime(2_999)
    expect(accion).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(accion).toHaveBeenCalledTimes(1)
    // Ya corrió: volver a la pestaña no la repite.
    reintento.ahora()
    expect(accion).toHaveBeenCalledTimes(1)
  })

  it('programar de nuevo reemplaza la espera anterior', () => {
    const reintento = crearReintento(accion, () => oculta)
    reintento.programar(3_000)
    reintento.programar(10_000)
    vi.advanceTimersByTime(9_999)
    expect(accion).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(accion).toHaveBeenCalledTimes(1)
  })

  it('con la pestaña oculta queda en pausa y corre apenas vuelve a estar visible', () => {
    const reintento = crearReintento(accion, () => oculta)
    reintento.programar(3_000)
    oculta = true
    vi.advanceTimersByTime(60 * 60_000)
    expect(accion).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    // Un visibilitychange que no la deja visible no la corre.
    reintento.ahora()
    expect(accion).not.toHaveBeenCalled()

    oculta = false
    reintento.ahora()
    expect(accion).toHaveBeenCalledTimes(1)
    reintento.ahora()
    expect(accion).toHaveBeenCalledTimes(1)
  })

  it('al volver a la pestaña no espera lo que falta', () => {
    const reintento = crearReintento(accion, () => oculta)
    reintento.programar(ESPERA_MAXIMA_MS)
    vi.advanceTimersByTime(1_000)
    reintento.ahora()
    expect(accion).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(ESPERA_MAXIMA_MS)
    expect(accion).toHaveBeenCalledTimes(1)
  })

  it('sin nada programado, ahora() no hace nada', () => {
    crearReintento(accion, () => oculta).ahora()
    expect(accion).not.toHaveBeenCalled()
  })

  it('cancelar descarta lo programado y lo que estaba en pausa', () => {
    const reintento = crearReintento(accion, () => oculta)
    reintento.programar(3_000)
    reintento.cancelar()
    vi.advanceTimersByTime(3_000)
    reintento.ahora()
    expect(accion).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)

    reintento.programar(3_000)
    oculta = true
    vi.advanceTimersByTime(3_000)
    reintento.cancelar()
    oculta = false
    reintento.ahora()
    expect(accion).not.toHaveBeenCalled()
  })
})
