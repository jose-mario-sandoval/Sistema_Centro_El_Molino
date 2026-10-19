import { expect, it, vi } from 'vitest'
import { leerPaginasPensiones } from '@/lib/pensiones/paginacion'

it('conserva el historial y los totales cuando superan 1000 filas', async () => {
  const filas = Array.from({ length: 1001 }, (_, id) => ({ id }))
  const cargar = vi.fn(async (desde: number, hasta: number) => ({ data: filas.slice(desde, hasta + 1), error: null }))
  expect(await leerPaginasPensiones(cargar)).toEqual(filas)
  expect(cargar.mock.calls).toEqual([[0, 499], [500, 999], [1000, 1499]])
})

it('si falla una página no devuelve una suma parcial como si estuviera completa', async () => {
  const error = new Error('Sin conexión')
  const cargar = vi.fn().mockResolvedValueOnce({ data: Array(500).fill(1), error: null }).mockResolvedValueOnce({ data: null, error })
  await expect(leerPaginasPensiones(cargar)).rejects.toBe(error)
})
