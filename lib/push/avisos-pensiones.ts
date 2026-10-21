import 'server-only'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { cargaPagoPension } from './cargas-pensiones'
import { enviarAUsuarios } from './enviar'

/** Se ejecuta en after(): ningún fallo push cambia el resultado de un pago ya guardado. */
export async function avisarPagoPension(pagoId: string): Promise<void> {
  try {
    const admin = crearClienteAdmin()
    const { data, error } = await admin.rpc('aviso_pago_pension', { p_pago_id: pagoId })
    if (error) throw error
    const pago = data[0]
    if (!pago || pago.abono_centavos <= 0) return
    const destinatarios = await admin.from('perfiles').select('id')
      .eq('rol', 'administradora').eq('activo', true).eq('avisar_pensiones', true)
    if (destinatarios.error) throw destinatarios.error
    await enviarAUsuarios(destinatarios.data.map((p) => p.id), cargaPagoPension({
      pagoId, siglas: pago.siglas, periodo: pago.periodo,
      abonoCentavos: pago.abono_centavos, completado: pago.completado,
    }), { avisoPagoPension: { pagoId } })
  } catch (error) {
    console.error('[push] aviso de pago de pensión', { pagoId, error })
  }
}
