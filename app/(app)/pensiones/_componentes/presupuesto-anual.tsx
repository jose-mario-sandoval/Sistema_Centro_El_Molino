import Link from 'next/link'
import { dolares, nombreMes, resumenAnual } from '@/lib/pensiones/calculos'
import { ETIQUETA_DONACIONES, ETIQUETA_PRESUPUESTO } from '@/lib/pensiones/etiquetas'

type Resumen = ReturnType<typeof resumenAnual>

/**
 * El presupuesto de un año completo: el total, mes por mes (cada uno lleva al detalle de ese mes) y por persona.
 * Los meses futuros muestran el presupuesto según los montos con vigencia en cada período.
 */
export function PresupuestoAnual({ anio, resumen, mesDeHoy, rol }: { anio: number; resumen: Resumen; mesDeHoy: string; rol: string }) {
  const { total, meses, personas, sinCuota, donaciones, sinDonacion } = resumen
  // La exención oculta la cuenta en la lista, incluso si empezó a mitad del año; los totales conservan su historia.
  const personasVisibles = personas.filter((p) => !p.exento && !p.exentoDesde)
  return <>
    <section className="card" aria-label="Resumen del año">
      <h3 className="section-title">Año {anio}</h3>
      <dl className="pensiones-cifras"><div><dt>{ETIQUETA_PRESUPUESTO.ejecutado}</dt><dd>{dolares(total.pagado)}</dd></div><div><dt>{ETIQUETA_PRESUPUESTO.anual}</dt><dd>{dolares(total.meta)}</dd></div><div><dt>{ETIQUETA_PRESUPUESTO.pendiente}</dt><dd>{dolares(total.falta)}</dd></div></dl>
      <label htmlFor="progreso-anual">Avance del presupuesto anual: {total.porcentaje.toFixed(1)} %</label>
      <progress id="progreso-anual" max="100" value={total.porcentaje}>{total.porcentaje.toFixed(1)} %</progress>
      {total.meta === 0 && <p>No hay un presupuesto anual configurado para este año.</p>}
      {sinCuota.length > 0 && <p role="status">{sinCuota.length} {sinCuota.length === 1 ? 'persona sin cuota configurada' : 'personas sin cuota configurada'} en algún mes: {sinCuota.join(', ')}. El presupuesto anual todavía no incluye esas cuotas.</p>}
      {sinDonacion && <p role="status">{ETIQUETA_DONACIONES}: hay meses sin monto configurado. El presupuesto anual todavía no incluye esos ingresos.</p>}
    </section>
    <section className="card" aria-label="Mes por mes">
      <h3 className="section-title">Mes por mes</h3>
      <p className="hint">Los meses que todavía no llegaron muestran el presupuesto mensual según las pensiones y los ingresos por donaciones configurados para cada período.</p>
      <ul className="pensiones-lista">
        {meses.map((m) => {
          const periodo = `${anio}-${String(m.indice + 1).padStart(2, '0')}-01`
          const estado = periodo === mesDeHoy ? 'Mes actual' : periodo > mesDeHoy ? 'Previsto' : null
          return <li key={periodo}>
            <strong>{nombreMes(periodo)}{estado && <> · <span className="role-pill">{estado}</span></>}</strong>
            <span>{ETIQUETA_PRESUPUESTO.mensual}: {dolares(m.meta)}</span>
            <span>{ETIQUETA_PRESUPUESTO.ejecutado}: {dolares(m.pagado)}</span>
            <span>{ETIQUETA_PRESUPUESTO.pendiente}: {dolares(m.falta)} · {m.porcentaje.toFixed(0)} %</span>
            <Link className="btn ghost" href={`/pensiones/presupuesto?anio=${anio}&mes=${m.indice + 1}`} aria-label={`Ver el detalle de ${nombreMes(periodo)} de ${anio}`}>Ver el mes</Link>
          </li>
        })}
      </ul>
    </section>
    <section className="card" aria-label="Por persona">
      <h3 className="section-title">Por persona</h3>
      {rol === 'administradora' && <p>Las personas se identifican únicamente por sus siglas.</p>}
      {personasVisibles.length ? <ul className="pensiones-lista">{personasVisibles.map((p) => <li key={p.usuario_id}>
        <strong>{p.etiqueta}</strong>
        <span>{p.meta > 0 ? <>Recibido {dolares(p.pagado)} de {dolares(p.meta)}</> : 'Sin cuota configurada'}</span>
        <span>{p.meta > 0 ? <>{ETIQUETA_PRESUPUESTO.pendiente}: {dolares(p.falta)}</> : null}</span>
      </li>)}</ul> : <p className="empty-state">No hay personas con cuota en este año.</p>}
    </section>
    {donaciones && <section className="card" aria-label={ETIQUETA_DONACIONES}>
      <h3 className="section-title">{ETIQUETA_DONACIONES}</h3>
      <p>{donaciones.meta === 0 ? 'Sin monto configurado' : donaciones.falta === 0 ? 'Recibido' : donaciones.pagado > 0 ? 'Recepción parcial' : 'Pendiente de recibir'}</p>
      <dl className="pensiones-cifras"><div><dt>{ETIQUETA_PRESUPUESTO.anual}</dt><dd>{dolares(donaciones.meta)}</dd></div><div><dt>Recibido</dt><dd>{dolares(donaciones.pagado)}</dd></div><div><dt>{ETIQUETA_PRESUPUESTO.pendiente}</dt><dd>{dolares(donaciones.falta)}</dd></div></dl>
    </section>}
  </>
}
