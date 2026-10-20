'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icono } from '@/components/ui/iconos'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import { centavosDesdeTexto, dolares, etiquetaPeriodo, saldoMes, seleccionPagable, textoMonto } from '@/lib/pensiones/calculos'
import { ETIQUETA_CATEGORIA, type CategoriaPension, type MesPension, type PagoPension } from '@/lib/pensiones/tipos'
import { marcarPensiones } from '../acciones'

export function MarcarPensiones({ meses, historial }: { meses: MesPension[]; historial: PagoPension[] }) {
  const [seleccion, setSeleccion] = useState<string[]>([])
  // Lo que la persona escribe en cada mes elegido (texto); sin tocar, paga todo lo que falta.
  const [escritos, setEscritos] = useState<Record<string, string>>({})
  const [revision, setRevision] = useState<{ meses: MesPension[]; abonos: number[]; total: number } | null>(null)
  const tituloRevision = useRef<HTMLHeadingElement>(null)
  const botonRevisar = useRef<HTMLButtonElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  const aviso = useAviso()
  const router = useRouter()
  // Un pago hecho en otra sesión deja de ser seleccionable al actualizar la vista.
  const pendientes = seleccion.filter((p) => meses.some((m) => m.periodo === p && saldoMes(m) > 0))
  // Un texto que no es un monto vale 0: la selección queda inválida y el campo avisa.
  const abonosEscritos = Object.fromEntries(pendientes.filter((p) => escritos[p] !== undefined).map((p) => [p, centavosDesdeTexto(escritos[p]) ?? 0]))
  const resumen = seleccionPagable(meses, pendientes, abonosEscritos)
  useEffect(() => { if (revision) tituloRevision.current?.focus() }, [revision])
  function cerrarRevision() {
    setRevision(null)
    requestAnimationFrame(() => botonRevisar.current?.focus())
  }
  async function confirmar() {
    if (ocupado || !revision) return
    setError(null)
    iniciar(async () => {
      // Se envía la copia revisada, aunque Realtime o el sondeo cambien las props mientras se lee.
      const resultado = await llamarAccion(() => marcarPensiones({
        periodos: revision.meses.map((m) => m.periodo),
        montos: revision.meses.map((m) => m.monto_centavos!),
        pagados: revision.meses.map((m) => m.pagado_centavos),
        abonos: revision.abonos,
      }))
      if (!resultado.ok) { setError(resultado.error); cerrarRevision(); router.refresh(); return }
      setSeleccion([])
      setEscritos({})
      cerrarRevision()
      aviso(resultado.data.cantidad ? 'Tus pagos quedaron registrados.' : 'Esos meses ya estaban pagados. No se duplicaron los pagos.')
      router.refresh()
    })
  }
  return <>
    <section className="card" aria-label="Meses de pensión">
      <p>La categoría y el monto corresponden a cada mes. Podés pagar un mes completo o solo una parte y completarlo después. Si falta una cuota, pedile al Director que la configure.</p>
      <fieldset disabled={ocupado || revision !== null} className="pensiones-meses"><legend>Elegí uno o varios meses con algo pendiente</legend>
        {meses.map((m) => {
          const saldo = saldoMes(m)
          const completo = m.pagado_centavos > 0 && saldo === 0
          const parcial = m.pagado_centavos > 0 && saldo > 0
          const habilitado = saldo > 0
          const elegido = pendientes.includes(m.periodo)
          const texto = escritos[m.periodo] ?? textoMonto(saldo)
          const valor = centavosDesdeTexto(texto)
          const errorMonto = elegido && (valor === null ? 'Escribí un monto en dólares, con hasta dos decimales.' : valor > saldo ? `No puede ser más de lo que falta: ${dolares(saldo)}.` : null)
          return <div key={m.periodo} className="pension-mes-bloque">
            <label className="pension-mes" data-disponible={habilitado} data-elegido={elegido}>
              <input type="checkbox" value={m.periodo} disabled={!habilitado} checked={elegido} onChange={(e) => { setError(null); setSeleccion(e.target.checked ? [...pendientes, m.periodo] : pendientes.filter((p) => p !== m.periodo)) }} />
              <span><strong>{etiquetaPeriodo(m.periodo)}</strong><span>{m.categoria ? ETIQUETA_CATEGORIA[m.categoria as CategoriaPension] : 'Sin cuota configurada'}</span><span>{m.monto_centavos !== null ? dolares(m.monto_centavos) : 'No disponible para registrar'}</span>{parcial && <span>Pagaste {dolares(m.pagado_centavos)} · Falta {dolares(saldo)}</span>}<span>{completo ? <><Icono nombre="si" /> Pagado</> : parcial ? 'Pago parcial' : habilitado ? 'Pendiente' : 'Sin cuota aplicable'}</span></span>
            </label>
            {elegido && <div className="field pension-abono">
              <label htmlFor={`abono-${m.periodo}`}>¿Cuánto pagás de {etiquetaPeriodo(m.periodo)}?</label>
              <input id={`abono-${m.periodo}`} inputMode="decimal" autoComplete="off" value={texto} disabled={ocupado || revision !== null} aria-invalid={errorMonto ? true : undefined} aria-describedby={`abono-ayuda-${m.periodo}`}
                onChange={(e) => { setError(null); setEscritos({ ...escritos, [m.periodo]: e.target.value }) }} />
              <p id={`abono-ayuda-${m.periodo}`} className={errorMonto ? 'campo-error' : 'hint'}>{errorMonto ?? `Falta ${dolares(saldo)}. Si pagás menos, podés completar el mes después.`}</p>
            </div>}
          </div>
        })}
      </fieldset>
      <p className="pensiones-total" aria-live="polite">{resumen.meses.length} meses seleccionados · Total: <strong>{dolares(resumen.total)}</strong></p>
      {!revision && <button ref={botonRevisar} className="btn" disabled={!resumen.valido || ocupado} onClick={() => setRevision({ meses: resumen.meses.map((m) => ({ ...m })), abonos: [...resumen.abonos], total: resumen.total })}>Revisar pagos</button>}
      {revision && <div className="pensiones-confirmacion" role="region" aria-label="Confirmar pagos">
        <h3 ref={tituloRevision} tabIndex={-1} className="section-title">¿Confirmás que ya pagaste estos montos?</h3>
        <ul>{revision.meses.map((m, i) => <li key={m.periodo}>{etiquetaPeriodo(m.periodo)}: {dolares(revision.abonos[i])}{revision.abonos[i] < saldoMes(m) && <> (queda pendiente {dolares(saldoMes(m) - revision.abonos[i])})</>}</li>)}</ul>
        <p><strong>Total: {dolares(revision.total)}</strong></p><p>El registro es definitivo. No se puede editar ni revertir desde el sistema.</p>
        <div className="pensiones-acciones"><button className="btn" aria-busy={ocupado} disabled={ocupado} onClick={confirmar}>{ocupado ? 'Registrando…' : 'Confirmar que ya pagué'}</button><button className="btn ghost" disabled={ocupado} onClick={cerrarRevision}>Volver a elegir</button></div>
      </div>}
      {error && <p className="campo-error" role="alert">{error}</p>}
    </section>
    <section className="card" aria-label="Historial de pagos"><h2 className="section-title">Tu historial de pagos</h2>
      {historial.length ? <ul className="pensiones-lista">{historial.map((p) => <li key={p.id}><strong>{etiquetaPeriodo(p.periodo)}</strong><span>{ETIQUETA_CATEGORIA[p.categoria as CategoriaPension]} · {p.abono_centavos < p.monto_centavos ? `Pagaste ${dolares(p.abono_centavos)} (cuota de ${dolares(p.monto_centavos)})` : dolares(p.abono_centavos)}</span><span>Registrado el {new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', dateStyle: 'medium' }).format(new Date(p.registrado_en))}</span></li>)}</ul> : <p className="empty-state">Todavía no registraste pagos.</p>}
    </section>
  </>
}
