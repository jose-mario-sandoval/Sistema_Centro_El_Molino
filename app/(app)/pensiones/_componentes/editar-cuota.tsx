'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import { dolares, etiquetaPeriodo } from '@/lib/pensiones/calculos'
import { MESES } from '@/lib/fechas/etiquetas'
import { CATEGORIAS_PENSION, ETIQUETA_CATEGORIA, type CategoriaPension } from '@/lib/pensiones/tipos'
import { guardarCuotaPension } from '../acciones'

type PersonaCuota = { id: string; nombre: string; exenta_desde: string | null; cuotas: { desde: string; categoria: string; monto_centavos: number }[] }
export function EditarCuota({ persona, actual }: { persona: PersonaCuota; actual: string }) {
  const vigente = persona.cuotas.find((c) => c.desde <= actual)
  const exenta = persona.exenta_desde !== null && persona.exenta_desde <= actual
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  const aviso = useAviso()
  const router = useRouter()
  function guardar(formulario: FormData) {
    setError(null)
    iniciar(async () => {
      const desde = `${formulario.get('desde_anio')}-${String(formulario.get('desde_mes')).padStart(2, '0')}-01`
      const r = await llamarAccion(() => guardarCuotaPension({ usuario_id: persona.id, desde, categoria: formulario.get('categoria'), monto: formulario.get('monto') }))
      if (!r.ok) { setError(r.error + (r.campos ? ' ' + Object.values(r.campos).join(' ') : '')); return }
      aviso('Cuota guardada.')
      router.refresh()
    })
  }
  return <section className="card" aria-label={`Cuota de ${persona.nombre}`}><h3 className="section-title">{persona.nombre}</h3>
    <p>{exenta ? `Exento de pensión · ${dolares(0)} desde ${etiquetaPeriodo(persona.exenta_desde!)}.` : vigente ? `Cuota vigente: ${ETIQUETA_CATEGORIA[vigente.categoria as CategoriaPension]} · ${dolares(vigente.monto_centavos)}` : 'Sin cuota vigente configurada.'}</p>
    {!exenta && <form action={guardar} className="pensiones-cuota"><fieldset disabled={ocupado}>
      <div className="field"><label htmlFor={`categoria-${persona.id}`}>Categoría</label><select id={`categoria-${persona.id}`} name="categoria" defaultValue={vigente?.categoria ?? ''} required><option value="" disabled>Elegí una categoría</option>{CATEGORIAS_PENSION.map((c) => <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>)}</select></div>
      <div className="field"><label htmlFor={`monto-${persona.id}`}>Monto mensual en dólares</label><input id={`monto-${persona.id}`} name="monto" inputMode="decimal" required placeholder="0.00" defaultValue={vigente ? (vigente.monto_centavos / 100).toFixed(2) : ''} /></div>
      <div className="field"><label htmlFor={`mes-${persona.id}`}>Mes de inicio</label><select id={`mes-${persona.id}`} name="desde_mes" required defaultValue={Number(actual.slice(5, 7))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></div>
      <div className="field"><label htmlFor={`anio-${persona.id}`}>Año de inicio</label><input id={`anio-${persona.id}`} name="desde_anio" type="number" required min={actual.slice(0, 4)} max="2200" defaultValue={Number(actual.slice(0, 4))} /></div>
      <button className="btn" type="submit" aria-busy={ocupado}>{ocupado ? 'Guardando…' : 'Guardar cuota'}</button>
    </fieldset></form>}
    {error && <p className="campo-error" role="alert">{error}</p>}
    {persona.cuotas.length > 0 && <details><summary>Vigencias registradas</summary><ul className="pensiones-lista">{persona.cuotas.map((c) => <li key={c.desde}><span>Desde {etiquetaPeriodo(c.desde)}</span><span>{ETIQUETA_CATEGORIA[c.categoria as CategoriaPension]} · {dolares(c.monto_centavos)}</span></li>)}</ul></details>}
  </section>
}
