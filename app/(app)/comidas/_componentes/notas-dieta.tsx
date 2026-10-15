'use client'

import { useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { fallo } from '@/lib/acciones/resultado'
import { LARGO_MAXIMO_NOTA_DIETA } from '@/lib/comidas/notas'
import type { Voz } from '@/lib/comidas/voz'
import { guardarNotaDieta } from '../acciones'

export function NotasDieta({ notaInicial, usuarioId, voz = 'propia' }: {
  notaInicial: string | null
  usuarioId?: string
  voz?: Voz
}) {
  const id = useId()
  const aviso = useAviso()
  const [nota, setNota] = useState(notaInicial ?? '')
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState('')
  const [pendiente, iniciar] = useTransition()
  const guardando = useRef(false)

  function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (guardando.current) return
    guardando.current = true
    setError(null)
    setEstado('')
    iniciar(async () => {
      try {
        const resultado = await guardarNotaDieta({ nota, usuarioId }).catch(() =>
          fallo('No se pudieron guardar las notas. Revisá tu conexión e intentá de nuevo.'),
        )
        if (!resultado.ok) {
          setError(resultado.error)
          aviso(resultado.error)
          return
        }
        setNota(nota.trim())
        const texto = nota.trim() ? 'Notas de dieta guardadas.' : 'Notas de dieta eliminadas.'
        setEstado(texto)
        aviso(texto)
      } finally {
        guardando.current = false
      }
    })
  }

  return (
    <section className="card notas-dieta" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="section-title">Notas de dieta (opcional)</h2>
      <form onSubmit={guardar} aria-busy={pendiente}>
        <div className="field">
          <label htmlFor={id}>{voz === 'propia' ? 'Indicaciones generales de tu dieta' : 'Indicaciones generales de su dieta'}</label>
          <p id={`${id}-ayuda`} className="hint">Administración puede consultar estas notas. Dejá el campo vacío y guardá para eliminarlas.</p>
          <textarea
            id={id}
            name="notaDieta"
            value={nota}
            onChange={(evento) => { setNota(evento.target.value); setEstado('') }}
            readOnly={pendiente}
            maxLength={LARGO_MAXIMO_NOTA_DIETA}
            aria-describedby={`${id}-ayuda${error ? ` ${id}-error` : ''}`}
            aria-invalid={error ? true : undefined}
          />
          {error && <p id={`${id}-error`} className="campo-error" role="alert">{error}</p>}
        </div>
        <button type="submit" className="btn" aria-disabled={pendiente}>{pendiente ? 'Guardando…' : 'Guardar notas de dieta'}</button>
        <p className="hint notas-dieta-estado" role="status">{estado}</p>
      </form>
    </section>
  )
}
