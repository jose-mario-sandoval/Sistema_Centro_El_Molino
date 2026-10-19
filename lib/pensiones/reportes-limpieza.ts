import 'server-only'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { BUCKET_REPORTES } from './reportes'

/** Sólo después de sesión autorizada o de validar CRON_SECRET. No borra la cola antes del objeto. */
export async function limpiarArchivosReportes(): Promise<{ eliminados: number; pendientes: number }> {
  const cliente = crearClienteAdmin()
  const { data, error } = await cliente.rpc('preparar_limpieza_reportes_pension')
  if (error) throw error
  let eliminados = 0
  let pendientes = 0
  for (const { ruta } of data) {
    try {
      const borrado = await cliente.storage.from(BUCKET_REPORTES).remove([ruta])
      if (borrado.error) { pendientes++; continue }
      const confirmacion = await cliente.from('pensiones_reportes_limpieza').delete().eq('ruta', ruta)
      if (confirmacion.error) { pendientes++; continue }
      eliminados++
    } catch {
      // La ruta sigue en la cola; pg_cron la reintentará aun si esta ejecución se interrumpe.
      pendientes++
    }
  }
  return { eliminados, pendientes }
}
