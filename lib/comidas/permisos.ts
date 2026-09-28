import type { Rol } from '@/lib/perfiles/roles'

export type ObjetivoComidas = { ok: true; usuarioId: string } | { ok: false; error: string }

const SIN_PERMISO = 'No tenés permiso para hacer esto.'

/**
 * De quién son las comidas (semana, plan, ausencias) que cambia una acción. Sin pedido, o pidiendo
 * las propias, son las de quien tiene la sesión; las de otra persona, solo si es el Director.
 * Administración no tiene comidas. Es un primer filtro: la base lo vuelve a exigir con
 * `puedo_gestionar_comidas_de()`, que además rechaza a una persona inactiva o de Administración.
 */
export function usuarioObjetivo(perfil: { id: string; rol: Rol }, pedido?: string | null): ObjetivoComidas {
  if (perfil.rol === 'administracion') return { ok: false, error: SIN_PERMISO }
  if (!pedido || pedido === perfil.id) return { ok: true, usuarioId: perfil.id }
  if (perfil.rol !== 'director') return { ok: false, error: SIN_PERMISO }
  return { ok: true, usuarioId: pedido }
}
