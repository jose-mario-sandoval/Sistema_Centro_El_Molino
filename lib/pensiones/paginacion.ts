/** Evita que max_rows de PostgREST recorte silenciosamente el historial o los totales. */
export async function leerPaginasPensiones<T>(
  cargar: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const filas: T[] = []
  const tamano = 500
  for (let desde = 0; ; desde += tamano) {
    const resultado = await cargar(desde, desde + tamano - 1)
    if (resultado.error) throw resultado.error
    if (!resultado.data) throw new Error('No se pudieron leer las pensiones completas.')
    filas.push(...resultado.data)
    if (resultado.data.length < tamano) return filas
  }
}
