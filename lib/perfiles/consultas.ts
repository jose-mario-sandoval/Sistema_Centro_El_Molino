import 'server-only'
import { obtenerPerfilActual } from '@/lib/auth/sesion'
import type { Rol } from '@/lib/perfiles/roles'
import { paraObservador, veSoloSiglas } from '@/lib/perfiles/visibilidad'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import type { Tabla } from '@/lib/supabase/tipos'

export type PerfilResumen = Pick<Tabla<'perfiles'>, 'id' | 'nombre' | 'siglas' | 'rol' | 'activo'>

/**
 * Perfiles tal como los ve quien pregunta: para Administración, `nombre` trae las siglas
 * (lib/perfiles/visibilidad.ts). Este es el único camino por el que los nombres llegan a las
 * pantallas de comidas y mensajes: cualquier pantalla nueva que lo use queda protegida.
 */
export async function listarPerfiles(opciones: { soloActivos?: boolean; roles?: Rol[] } = {}): Promise<PerfilResumen[]> {
  const observador = await obtenerPerfilActual()
  const soloSiglas = veSoloSiglas(observador?.rol)

  const supabase = await crearClienteServidor()
  // Ordenar por nombre delataría el orden alfabético de nombres que Administración no debe conocer.
  let consulta = supabase
    .from('perfiles')
    .select('id, nombre, siglas, rol, activo')
    .order(soloSiglas ? 'siglas' : 'nombre')
  if (opciones.soloActivos) consulta = consulta.eq('activo', true)
  if (opciones.roles?.length) consulta = consulta.in('rol', opciones.roles)
  const { data, error } = await consulta
  if (error) throw error
  return data.map((perfil) => paraObservador(perfil, observador?.rol))
}
