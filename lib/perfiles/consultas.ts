import 'server-only'
import type { Rol } from '@/lib/perfiles/roles'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import type { Tabla } from '@/lib/supabase/tipos'

export type PerfilResumen = Pick<Tabla<'perfiles'>, 'id' | 'nombre' | 'siglas' | 'rol' | 'activo'>

export async function listarPerfiles(opciones: { soloActivos?: boolean; roles?: Rol[] } = {}): Promise<PerfilResumen[]> {
  const supabase = await crearClienteServidor()
  let consulta = supabase.from('perfiles').select('id, nombre, siglas, rol, activo').order('nombre')
  if (opciones.soloActivos) consulta = consulta.eq('activo', true)
  if (opciones.roles?.length) consulta = consulta.in('rol', opciones.roles)
  const { data, error } = await consulta
  if (error) throw error
  return data
}
