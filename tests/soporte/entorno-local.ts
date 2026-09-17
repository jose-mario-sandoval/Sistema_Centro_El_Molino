/** Impide correr pruebas que escriben datos contra el proyecto real (spec §9.2). */
export function exigirBaseLocal() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
    throw new Error(
      `Las pruebas de integración y e2e solo corren contra Supabase local (CI). NEXT_PUBLIC_SUPABASE_URL="${url}"`,
    )
  }
}
