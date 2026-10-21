'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Icono } from '@/components/ui/iconos'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import { dolares, etiquetaPeriodo } from '@/lib/pensiones/calculos'
import type { MesDonacion } from '@/lib/pensiones/donaciones'
import { recibirDonacionPension } from '../acciones-donacion'

export function Donacion({ meses }: { meses: MesDonacion[] }) {
  const [revision, setRevision] = useState<{ periodo: string; monto: number } | null>(null)
  const tituloRevision = useRef<HTMLHeadingElement>(null)
  const botonRevision = useRef<HTMLButtonElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, iniciar] = useTransition()
  const aviso = useAviso()
  const router = useRouter()
  useEffect(() => { if (revision) tituloRevision.current?.focus() }, [revision])
  const revisar = revision && !meses.find((m) => m.periodo === revision.periodo)?.recibido_en ? revision : null
  function cerrarRevision() {
    setRevision(null)
    requestAnimationFrame(() => botonRevision.current?.focus())
  }
  function confirmar() {
    if (ocupado || !revisar) return
    setError(null)
    iniciar(async () => {
      const resultado = await llamarAccion(() => recibirDonacionPension({ periodo: revisar.periodo, monto_esperado: revisar.monto }))
      if (!resultado.ok) { setError(resultado.error); cerrarRevision(); router.refresh(); return }
      cerrarRevision()
      aviso(resultado.data.nueva ? 'Donación recibida registrada para toda la casa.' : 'La donación ya estaba recibida. Se conservó un único registro.')
      router.refresh()
    })
  }
  return <section className="card" aria-label="Donación">
    <h2 className="section-title">Donación</h2>
    <p>El estado es compartido por todos los Directores y es independiente de tu pensión personal.</p>
    <div className="pensiones-meses">{meses.map((m) => <div key={m.periodo} className="pension-mes" role="region" aria-label={`Donación de ${etiquetaPeriodo(m.periodo)}`}><span>
      <strong>{etiquetaPeriodo(m.periodo)}</strong>
      <span>{m.monto_centavos === null ? 'Sin donación configurada para este período.' : dolares(m.monto_centavos)}</span>
      <span>{m.recibido_en ? <><Icono nombre="si" /> Recibida</> : m.monto_centavos !== null ? 'Pendiente de recibir' : 'No disponible para registrar'}</span>
      {m.recibido_en && <span>Recibida el {new Intl.DateTimeFormat('es-SV', { timeZone: 'America/El_Salvador', dateStyle: 'medium' }).format(new Date(m.recibido_en))}</span>}
      {!m.recibido_en && m.monto_centavos !== null && <button className="btn" disabled={ocupado || revisar !== null} onClick={(e) => { setError(null); botonRevision.current = e.currentTarget; setRevision({ periodo: m.periodo, monto: m.monto_centavos! }) }}>Donación recibida</button>}
    </span></div>)}</div>
    {revisar && <div className="pensiones-confirmacion" role="region" aria-label="Confirmar donación">
      <h3 ref={tituloRevision} tabIndex={-1} className="section-title">¿Confirmás que se recibió la donación?</h3>
      <p>{etiquetaPeriodo(revisar.periodo)}: <strong>{dolares(revisar.monto)}</strong></p>
      <p>El registro es definitivo y quedará recibido para todos los Directores.</p>
      <div className="pensiones-acciones"><button className="btn" disabled={ocupado} aria-busy={ocupado} onClick={confirmar}>{ocupado ? 'Registrando…' : 'Confirmar donación recibida'}</button><button className="btn ghost" disabled={ocupado} onClick={cerrarRevision}>Cancelar</button></div>
    </div>}
    {error && <p className="campo-error" role="alert">{error}</p>}
  </section>
}
