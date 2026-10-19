import 'server-only'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { categoriaReporteValida, type ReportePension } from './reportes'

/** RLS vuelve a comprobar el rol incluso si se llama fuera de la página autorizada. */
export async function listarReportesPensiones(): Promise<ReportePension[]> {
  const cliente = await crearClienteServidor()
  const { data, error } = await cliente.from('pensiones_reportes')
    .select('id, categoria, nombre, tamano, cargado_en')
    .order('cargado_en', { ascending: false }).order('id', { ascending: false })
  if (error) throw error
  return data.flatMap((fila) => categoriaReporteValida(fila.categoria) ? [{
    id: fila.id, categoria: fila.categoria, nombre: fila.nombre, tamano: fila.tamano, cargadoEn: fila.cargado_en,
  }] : [])
}
