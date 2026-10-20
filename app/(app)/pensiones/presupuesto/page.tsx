import { exigirRol } from '@/lib/auth/sesion'
import { dolares, etiquetaPeriodo, mesActual, resumenPresupuesto } from '@/lib/pensiones/calculos'
import { obtenerPresupuesto } from '@/lib/pensiones/consultas'
import { ROLES_PRESUPUESTO } from '@/lib/pensiones/permisos'
import { esquemaAnioPension } from '@/lib/validacion/pensiones'
import { SelectorPeriodo } from '../_componentes/selector-periodo'

export default async function PaginaPresupuesto({ searchParams }: { searchParams: Promise<{ anio?: string; mes?: string }> }) {
  const perfil = await exigirRol(...ROLES_PRESUPUESTO)
  const actual = mesActual()
  const params = await searchParams
  const pedido = esquemaAnioPension.safeParse(params.anio)
  const anio = pedido.success ? pedido.data : Number(actual.slice(0, 4))
  const numero = Number(params.mes)
  const mes = Number.isInteger(numero) && numero >= 1 && numero <= 12 ? numero : Number(actual.slice(5, 7))
  const periodo = `${anio}-${String(mes).padStart(2, '0')}-01`
  const filas = await obtenerPresupuesto(periodo)
  const resumen = resumenPresupuesto(filas)
  const pagados = filas.filter((f) => f.pagado_centavos > 0)
  const sinCuota = filas.filter((f) => f.monto_centavos === null)
  return <>
    <h2 className="section-title">Presupuesto</h2>
    <SelectorPeriodo key={periodo} ruta="/pensiones/presupuesto" anio={anio} mes={mes} />
    <section className="card" aria-label="Resumen del presupuesto">
      <h3 className="section-title">{etiquetaPeriodo(periodo)}</h3>
      <dl className="pensiones-cifras"><div><dt>Registrado como pagado</dt><dd>{dolares(resumen.pagado)}</dd></div><div><dt>Meta mensual</dt><dd>{dolares(resumen.meta)}</dd></div><div><dt>Falta para la meta</dt><dd>{dolares(resumen.falta)}</dd></div></dl>
      <label htmlFor="progreso-pension">Avance: {resumen.porcentaje.toFixed(1)} %</label>
      <progress id="progreso-pension" max="100" value={resumen.porcentaje}>{resumen.porcentaje.toFixed(1)} %</progress>
      {resumen.meta === 0 && <p>No hay una meta configurada para este período.</p>}
      {sinCuota.length > 0 && <p role="status">{sinCuota.length} personas sin cuota configurada: {sinCuota.map((p) => p.etiqueta).join(', ')}. La meta todavía no incluye sus cuotas.</p>}
    </section>
    <section className="card" aria-label="Pagos del período"><h3 className="section-title">Quiénes ya pagaron</h3>
      {perfil.rol === 'administradora' && <p>Las personas se identifican únicamente por sus siglas.</p>}
      {pagados.length ? <ul className="pensiones-lista">{pagados.map((f) => {
        const parcial = f.monto_centavos !== null && f.pagado_centavos < f.monto_centavos
        return <li key={f.usuario_id}><strong>{f.etiqueta}</strong><span>{dolares(f.pagado_centavos)}{parcial && <> de {dolares(f.monto_centavos!)} · <span className="role-pill">Pago parcial</span></>}</span></li>
      })}</ul> : <p className="empty-state">No hay pagos registrados para este período.</p>}
    </section>
  </>
}
