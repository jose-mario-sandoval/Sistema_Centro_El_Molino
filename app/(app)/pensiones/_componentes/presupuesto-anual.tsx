import Link from 'next/link'
import { dolares, nombreMes, resumenAnual } from '@/lib/pensiones/calculos'

type Resumen = ReturnType<typeof resumenAnual>

/**
 * El presupuesto de un año completo: el total, mes por mes (cada uno lleva al detalle de ese mes) y por persona.
 * Los meses que faltan muestran la meta según las cuotas de hoy: es una proyección, no un cobro.
 */
export function PresupuestoAnual({ anio, resumen, mesDeHoy, rol }: { anio: number; resumen: Resumen; mesDeHoy: string; rol: string }) {
  const { total, meses, personas, sinCuota } = resumen
  return <>
    <section className="card" aria-label="Resumen del año">
      <h3 className="section-title">Año {anio}</h3>
      <dl className="pensiones-cifras"><div><dt>Registrado como pagado</dt><dd>{dolares(total.pagado)}</dd></div><div><dt>Meta del año</dt><dd>{dolares(total.meta)}</dd></div><div><dt>Falta para la meta</dt><dd>{dolares(total.falta)}</dd></div></dl>
      <label htmlFor="progreso-anual">Avance del año: {total.porcentaje.toFixed(1)} %</label>
      <progress id="progreso-anual" max="100" value={total.porcentaje}>{total.porcentaje.toFixed(1)} %</progress>
      {total.meta === 0 && <p>No hay una meta configurada para este año.</p>}
      {sinCuota.length > 0 && <p role="status">{sinCuota.length} {sinCuota.length === 1 ? 'persona sin cuota configurada' : 'personas sin cuota configurada'} en algún mes: {sinCuota.join(', ')}. La meta todavía no incluye esas cuotas.</p>}
    </section>
    <section className="card" aria-label="Mes por mes">
      <h3 className="section-title">Mes por mes</h3>
      <p className="hint">Los meses que todavía no llegaron muestran la meta según las cuotas de hoy.</p>
      <ul className="pensiones-lista">
        {meses.map((m) => {
          const periodo = `${anio}-${String(m.indice + 1).padStart(2, '0')}-01`
          const estado = periodo === mesDeHoy ? 'Mes actual' : periodo > mesDeHoy ? 'Previsto' : null
          return <li key={periodo}>
            <strong>{nombreMes(periodo)}{estado && <> · <span className="role-pill">{estado}</span></>}</strong>
            <span>{m.meta > 0 ? <>Pagado {dolares(m.pagado)} de {dolares(m.meta)}</> : 'Sin meta configurada'}</span>
            <span>{m.meta > 0 ? <>Falta {dolares(m.falta)} · {m.porcentaje.toFixed(0)} %</> : null}</span>
            <Link href={`/pensiones/presupuesto?anio=${anio}&mes=${m.indice + 1}`} aria-label={`Ver el detalle de ${nombreMes(periodo)} de ${anio}`}>Ver el mes</Link>
          </li>
        })}
      </ul>
    </section>
    <section className="card" aria-label="Por persona">
      <h3 className="section-title">Por persona</h3>
      {rol === 'administradora' && <p>Las personas se identifican únicamente por sus siglas.</p>}
      {personas.length ? <ul className="pensiones-lista">{personas.map((p) => <li key={p.usuario_id}>
        <strong>{p.etiqueta}</strong>
        <span>{p.meta > 0 ? <>Pagó {dolares(p.pagado)} de {dolares(p.meta)}</> : 'Sin cuota configurada'}</span>
        <span>{p.meta > 0 ? <>Falta {dolares(p.falta)}</> : null}</span>
      </li>)}</ul> : <p className="empty-state">No hay personas con cuota en este año.</p>}
    </section>
  </>
}
