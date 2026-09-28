/**
 * PostgREST corta las respuestas en `max_rows` (supabase/config.toml) sin avisar. Con
 * `{ count: 'exact' }` sabemos cuántas filas había: si llegaron menos, mejor fallar que mostrarle
 * cantidades de menos a la cocina.
 */
export function exigirFilasCompletas(resultado: { data: readonly unknown[]; count: number | null }, que: string): void {
  if (resultado.count !== null && resultado.count > resultado.data.length) {
    throw new Error(`${que}: llegaron ${resultado.data.length} de ${resultado.count} filas (PostgREST cortó en max_rows).`)
  }
}
