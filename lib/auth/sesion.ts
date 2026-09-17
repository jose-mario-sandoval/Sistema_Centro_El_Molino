import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { fallo } from '@/lib/acciones/resultado'
import type { Rol } from '@/lib/perfiles/roles'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import type { Tabla } from '@/lib/supabase/tipos'

export type Perfil = Tabla<'perfiles'>
export type { Rol }

/** Perfil del usuario con sesión, o null si no hay sesión o la cuenta está inactiva (RLS no lo deja leer). */
export const obtenerPerfilActual = cache(async (): Promise<Perfil | null> => {
  const supabase = await crearClienteServidor()
  const { data } = await supabase.auth.getClaims()
  const id = data?.claims?.sub
  if (!id) return null
  const { data: perfil } = await supabase.from('perfiles').select('*').eq('id', id).maybeSingle()
  if (!perfil || !perfil.activo) return null
  return perfil
})

/** Para páginas: redirige a /login o /cambiar-contrasena según corresponda. */
export async function exigirPerfil(): Promise<Perfil> {
  const perfil = await obtenerPerfilActual()
  if (!perfil) redirect('/login')
  if (perfil.debe_cambiar_contrasena) redirect('/cambiar-contrasena')
  return perfil
}

/** Para páginas restringidas a ciertos roles. */
export async function exigirRol(...roles: Rol[]): Promise<Perfil> {
  const perfil = await exigirPerfil()
  if (!roles.includes(perfil.rol)) redirect('/comidas/semana')
  return perfil
}

/** Para Server Actions: nunca redirige; devuelve un fallo si no corresponde. */
export async function perfilParaAccion(
  ...roles: Rol[]
): Promise<{ ok: true; perfil: Perfil } | ReturnType<typeof fallo>> {
  const perfil = await obtenerPerfilActual()
  if (!perfil || perfil.debe_cambiar_contrasena) return fallo('Tu sesión expiró. Volvé a iniciar sesión.')
  if (roles.length > 0 && !roles.includes(perfil.rol)) return fallo('No tenés permiso para hacer esto.')
  return { ok: true, perfil }
}
