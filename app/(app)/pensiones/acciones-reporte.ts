'use server'

import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { BUCKET_REPORTES } from '@/lib/pensiones/reportes'
import { limpiarArchivosReportes } from '@/lib/pensiones/reportes-limpieza'
import { esquemaEliminarReporte, validarCargaReporte } from '@/lib/validacion/reportes-pensiones'

export async function subirReportePension(formulario: FormData): Promise<Resultado<{ id: string }>> {
  const permiso = await perfilParaAccion('administradora')
  if (!permiso.ok) return permiso
  const validado = await validarCargaReporte(formulario)
  if (!validado.ok) return validado
  const { categoria, nombre, bytes, tamano } = validado.data
  const cliente = await crearClienteServidor()
  let reserva: { id: string; ruta: string } | undefined
  try {
    const reservada = await cliente.rpc('reservar_reporte_pension', { p_categoria: categoria, p_nombre: nombre, p_tamano: tamano })
    if (reservada.error || !reservada.data?.[0]) throw reservada.error ?? new Error('Reserva vacía')
    reserva = reservada.data[0]
    // La llave secreta sólo se crea después de la autorización y de reservar la ruta en la base.
    const admin = crearClienteAdmin()
    const carga = await admin.storage.from(BUCKET_REPORTES).upload(reserva.ruta, bytes, {
      contentType: 'application/pdf', upsert: false, cacheControl: '0',
    })
    if (carga.error) throw carga.error
    const finalizado = await cliente.rpc('finalizar_reporte_pension', { p_id: reserva.id })
    if (finalizado.error || !finalizado.data) throw finalizado.error ?? new Error('Confirmación vacía')
  } catch (error) {
    console.error('[pensiones] No se pudo completar la carga de un reporte', error)
    if (reserva) {
      // Una respuesta perdida no demuestra que la transacción haya fallado: comprobar antes de informar.
      try {
        const verificacion = await cliente.from('pensiones_reportes').select('id').eq('id', reserva.id).maybeSingle()
        if (!verificacion.error && verificacion.data) {
          revalidatePath('/pensiones/reporte')
          programarLimpieza()
          return exito({ id: reserva.id })
        }
        // Abandonar bloquea la reserva. Si ya fue finalizada, no toca su archivo ni sus metadatos.
        await cliente.rpc('abandonar_reporte_pension', { p_id: reserva.id })
      } catch {
        // La reserva durable vencerá en una hora y el trabajador la recogerá sin depender del request.
      }
      programarLimpieza()
    }
    return fallo('No se pudo confirmar la carga. Recargá los reportes antes de intentarlo de nuevo.')
  }
  revalidatePath('/pensiones/reporte')
  programarLimpieza()
  return exito({ id: reserva.id })
}

function programarLimpieza() {
  after(async () => {
    try { await limpiarArchivosReportes() }
    catch (error) { console.error('[pensiones] Limpieza pendiente; se reintentará por cron', error) }
  })
}

/**
 * Quita un reporte subido por error. Solo la Administradora. La base borra la ficha y encola la ruta; el
 * archivo de Storage se borra después (aquí mismo, y el cron lo reintenta si algo se corta). Quitar uno que
 * ya no existe no es un error.
 */
export async function eliminarReportePension(entrada: unknown): Promise<Resultado<null>> {
  const permiso = await perfilParaAccion('administradora')
  if (!permiso.ok) return permiso
  const datos = esquemaEliminarReporte.safeParse(entrada)
  if (!datos.success) return fallo('No se pudo identificar el reporte.')
  const cliente = await crearClienteServidor()
  const { error } = await cliente.rpc('eliminar_reporte_pension', { p_id: datos.data.id })
  if (error) {
    console.error('[pensiones] No se pudo eliminar un reporte', error)
    return fallo('No se pudo eliminar el reporte. Recargá la página e intentá de nuevo.')
  }
  revalidatePath('/pensiones/reporte')
  programarLimpieza()
  return exito(null)
}
