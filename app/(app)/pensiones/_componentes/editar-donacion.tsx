'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import { dolares, etiquetaPeriodo, textoMonto } from '@/lib/pensiones/calculos'
import type { ConfiguracionDonacion } from '@/lib/pensiones/donaciones'
import { ETIQUETA_DONACIONES } from '@/lib/pensiones/etiquetas'
import { MESES } from '@/lib/fechas/etiquetas'
import { guardarDonacionPension } from '../acciones-donacion'

export function EditarDonacion({ configuraciones, actual }: { configuraciones: ConfiguracionDonacion[]; actual: string }) {
  const vigente = configuraciones.find((c) => c.desde <= actual)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  const aviso = useAviso()
  const router = useRouter()
  function guardar(formulario: FormData) {
    setError(null)
    iniciar(async () => {
      const desde = `${formulario.get('desde_anio')}-${String(formulario.get('desde_mes')).padStart(2, '0')}-01`
      const resultado = await llamarAccion(() => guardarDonacionPension({ desde, monto: formulario.get('monto') }))
      if (!resultado.ok) { setError(resultado.error + (resultado.campos ? ' ' + Object.values(resultado.campos).join(' ') : '')); return }
      aviso('Monto mensual de ingresos por donaciones guardado.')
      router.refresh()
    })
  }
  return <section className="card" aria-label={ETIQUETA_DONACIONES}>
    <h2 className="section-title">{ETIQUETA_DONACIONES}</h2>
    <p>Un monto mensual compartido para toda la casa. El monto continúa vigente hasta que un Director lo cambie.</p>
    <p>{vigente ? `Monto vigente de ingresos por donaciones: ${dolares(vigente.monto_centavos)} al mes.` : 'Todavía no hay un monto de ingresos por donaciones configurado para el mes actual.'}</p>
    <p>Elegí desde qué mes se aplica el monto. Los ingresos por donaciones ya recibidos conservan su importe original.</p>
    <form action={guardar} className="pensiones-cuota"><fieldset disabled={ocupado}>
      <div className="field"><label htmlFor="donacion-monto">Monto mensual de ingresos por donaciones en dólares</label><input id="donacion-monto" name="monto" inputMode="decimal" required placeholder="0.00" defaultValue={vigente ? textoMonto(vigente.monto_centavos) : ''} /></div>
      <div className="field"><label htmlFor="donacion-desde-mes">Mes de inicio de ingresos por donaciones</label><select id="donacion-desde-mes" name="desde_mes" required defaultValue={Number(actual.slice(5, 7))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
      <div className="field"><label htmlFor="donacion-desde-anio">Año de inicio de ingresos por donaciones</label><input id="donacion-desde-anio" name="desde_anio" type="number" required min={actual.slice(0, 4)} max="2200" defaultValue={Number(actual.slice(0, 4))} /></div>
      <button className="btn" type="submit" aria-busy={ocupado}>{ocupado ? 'Guardando…' : 'Guardar monto'}</button>
    </fieldset></form>
    {error && <p className="campo-error" role="alert">{error}</p>}
    {configuraciones.length > 0 && <details><summary>Vigencias de ingresos por donaciones registradas</summary><ul className="pensiones-lista">{configuraciones.map((c) => <li key={c.desde}><span>Desde {etiquetaPeriodo(c.desde)}</span><span>{dolares(c.monto_centavos)} al mes</span></li>)}</ul></details>}
  </section>
}
