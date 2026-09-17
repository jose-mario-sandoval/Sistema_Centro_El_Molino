import 'server-only'
import type { HorasLimite } from '@/lib/comidas/tipos'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { horasLimiteDesdeFilas } from './horas-limite'
import type { Cuenta } from './tipos'

/** Las 3 horas límite vigentes (RLS: cualquier usuario activo las lee). */
export async function obtenerHorasLimite(): Promise<HorasLimite> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('horas_limite').select('comida, dia_relativo, hora')
  if (error) throw error
  return horasLimiteDesdeFilas(data)
}

/**
 * Todas las cuentas, incluidas las desactivadas: primero las activas, después por nombre.
 * `listarPerfiles` (Fase 0) no incluye correo ni la marca de contraseña temporal.
 */
export async function listarCuentas(): Promise<Cuenta[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, siglas, correo, rol, activo, debe_cambiar_contrasena')
    .order('activo', { ascending: false })
    .order('nombre')
  if (error) throw error
  return data
}
