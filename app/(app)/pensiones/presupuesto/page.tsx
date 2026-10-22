import { exigirRol } from '@/lib/auth/sesion'
import Link from 'next/link'
import { dolares, etiquetaPeriodo, mesActual, resumenAnual, resumenPresupuesto, saldoMes } from '@/lib/pensiones/calculos'
import { obtenerPresupuesto, obtenerPresupuestoAnual } from '@/lib/pensiones/consultas'
import { ROLES_PRESUPUESTO } from '@/lib/pensiones/permisos'
import { esquemaAnioPension } from '@/lib/validacion/pensiones'
import { ETIQUETA_DONACIONES, ETIQUETA_PRESUPUESTO } from '@/lib/pensiones/etiquetas'
import { PresupuestoAnual } from '../_componentes/presupuesto-anual'
import { SelectorPeriodo } from '../_componentes/selector-periodo'

export default async function PaginaPresupuesto({ searchParams }: { searchParams: Promise<{ anio?: string; mes?: string; vista?: string }> }) {
  const perfil = await exigirRol(...ROLES_PRESUPUESTO)
  const actual = mesActual()
  const params = await searchParams
  const pedido = esquemaAnioPension.safeParse(params.anio)
  const anio = pedido.success ? pedido.data : Number(actual.slice(0, 4))
  const numero = Number(params.mes)
  const mes = Number.isInteger(numero) && numero >= 1 && numero <= 12 ? numero : Number(actual.slice(5, 7))
  const anual = params.vista === 'anual'
  const vistas = <nav className="sub-tabs" aria-label="Período del presupuesto">
    <Link href={`/pensiones/presupuesto?anio=${anio}&mes=${mes}`} className={`sub-tab${anual ? '' : ' active'}`} aria-current={anual ? undefined : 'page'}>Por mes</Link>
    <Link href={`/pensiones/presupuesto?vista=anual&anio=${anio}`} className={`sub-tab${anual ? ' active' : ''}`} aria-current={anual ? 'page' : undefined}>Año completo</Link>
  </nav>
  if (anual) {
    const resumenDelAnio = resumenAnual(await obtenerPresupuestoAnual(anio))
    return <>
      <h2 className="section-title">Presupuesto</h2>
      {vistas}
      <SelectorPeriodo key={`anual-${anio}`} ruta="/pensiones/presupuesto" anio={anio} vista="anual" />
      <PresupuestoAnual anio={anio} resumen={resumenDelAnio} mesDeHoy={actual} rol={perfil.rol} />
    </>
  }
  const periodo = `${anio}-${String(mes).padStart(2, '0')}-01`
  const filas = await obtenerPresupuesto(periodo)
  const resumen = resumenPresupuesto(filas)
  const pendientes = filas.filter((f) => f.concepto === 'pension' && saldoMes(f) > 0)
  const sinCuota = filas.filter((f) => f.concepto === 'pension' && !f.exento && f.monto_centavos === null)
  const donacion = filas.find((f) => f.concepto === 'donacion')
  const ingresos = filas.filter((f) => f.pagado_centavos > 0)
  return <>
    <h2 className="section-title">Presupuesto</h2>
    {vistas}
    <SelectorPeriodo key={periodo} ruta="/pensiones/presupuesto" anio={anio} mes={mes} />
    <section className="card" aria-label="Resumen del presupuesto">
      <h3 className="section-title">{etiquetaPeriodo(periodo)}</h3>
      <dl className="pensiones-cifras"><div><dt>{ETIQUETA_PRESUPUESTO.ejecutado}</dt><dd>{dolares(resumen.pagado)}</dd></div><div><dt>{ETIQUETA_PRESUPUESTO.mensual}</dt><dd>{dolares(resumen.meta)}</dd></div><div><dt>{ETIQUETA_PRESUPUESTO.pendiente}</dt><dd>{dolares(resumen.falta)}</dd></div></dl>
      <label htmlFor="progreso-pension">Avance del presupuesto mensual: {resumen.porcentaje.toFixed(1)} %</label>
      <progress id="progreso-pension" max="100" value={resumen.porcentaje}>{resumen.porcentaje.toFixed(1)} %</progress>
      {resumen.meta === 0 && <p>No hay un presupuesto mensual configurado para este período.</p>}
      {pendientes.length > 0 && <p role="status">{pendientes.length} {pendientes.length === 1 ? 'persona con pago pendiente' : 'personas con pagos pendientes'}: {pendientes.map((p) => `${p.etiqueta} (falta ${dolares(saldoMes(p))})`).join(', ')}.</p>}
      {sinCuota.length > 0 && <p role="status">{sinCuota.length} {sinCuota.length === 1 ? 'persona sin monto asignado' : 'personas sin monto asignado'}: {sinCuota.map((p) => p.etiqueta).join(', ')}. El presupuesto mensual todavía no incluye {sinCuota.length === 1 ? 'su cuota' : 'sus cuotas'}.</p>}
      {donacion && saldoMes(donacion) > 0 && <p role="status">{ETIQUETA_DONACIONES}: pendiente de recibir {dolares(saldoMes(donacion))}.</p>}
      {donacion?.monto_centavos === null && <p role="status">{ETIQUETA_DONACIONES}: sin monto configurado para este período. El presupuesto mensual todavía no incluye este ingreso.</p>}
    </section>
    <section className="card" aria-label="Pagos del período"><h3 className="section-title">Ingresos del período</h3>
      {perfil.rol === 'administradora' && <p>Las personas se identifican únicamente por sus siglas.</p>}
      {ingresos.length ? <ul className="pensiones-lista">{ingresos.map((f) => <li key={f.concepto === 'donacion' ? 'donacion' : f.usuario_id} aria-label={f.etiqueta}>
        <strong>{f.etiqueta}</strong><span>{dolares(f.pagado_centavos)}</span>
      </li>)}</ul> : <p className="empty-state">No hay ingresos recibidos para este período.</p>}
    </section>
  </>
}
