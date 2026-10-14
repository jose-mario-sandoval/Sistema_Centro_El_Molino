'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import { LIMITE_REGISTRO, type PaginaRegistro } from '@/lib/mensajes/consulta-registro'
import { fechaHoraLocal } from '@/lib/mensajes/tiempo'
import type { PerfilResumen } from '@/lib/perfiles/consultas'
import { cargarRegistroModeracion } from '../acciones'

export function TablaRegistro({ inicial, perfiles }: { inicial: PaginaRegistro; perfiles: PerfilResumen[] }) {
  const [pagina, setPagina] = useState(inicial)
  const [pendiente, iniciar] = useTransition()
  const enCurso = useRef(false)
  const enfocarEstado = useRef(false)
  const estado = useRef<HTMLParagraphElement>(null)
  const aviso = useAviso()
  const nombres = new Map(perfiles.map((p) => [p.id, p.nombre]))

  // El botón desaparece al llegar al final: el foco queda en la cuenta anunciada, no en la nada.
  useEffect(() => {
    if (!enfocarEstado.current) return
    enfocarEstado.current = false
    estado.current?.focus({ preventScroll: true })
  }, [pagina])

  function cargarMas() {
    if (!pagina.cursor || !pagina.hayMas || enCurso.current) return
    enCurso.current = true
    const antesDe = pagina.cursor
    iniciar(async () => {
      try {
        const resultado = await llamarAccion(() => cargarRegistroModeracion({ antesDe }))
        if (!resultado.ok) {
          aviso(resultado.error)
          return
        }
        enfocarEstado.current = true
        setPagina((anterior) => {
          const ids = new Set(anterior.entradas.map((e) => e.id))
          return {
            ...resultado.data,
            entradas: [...anterior.entradas, ...resultado.data.entradas.filter((e) => !ids.has(e.id))],
          }
        })
      } finally {
        enCurso.current = false
      }
    })
  }

  if (pagina.entradas.length === 0) {
    return (
      <div className="card">
        <div className="empty-state">No hay mensajes eliminados en los últimos tres meses.</div>
      </div>
    )
  }

  return (
    <div className="card">
      <p className="desc" style={{ marginBottom: 12 }}>
        Mensajes de otras personas eliminados por un Director en los últimos tres meses.
        {' '}Se muestran de {LIMITE_REGISTRO} en {LIMITE_REGISTRO}.
      </p>
      <div className="admin-table-scroll" aria-busy={pendiente || undefined}>
        <table className="user-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Eliminado por</th>
              <th>Autor</th>
              <th>Tipo</th>
              <th>Texto</th>
            </tr>
          </thead>
          <tbody>
            {pagina.entradas.map((e) => (
              <tr key={e.id}>
                <td data-et="Fecha" style={{ whiteSpace: 'nowrap' }}>{fechaHoraLocal(e.eliminado_en)}</td>
                <td data-et="Eliminado por">{nombres.get(e.moderador_id) ?? '—'}</td>
                <td data-et="Autor">{nombres.get(e.autor_id) ?? '—'}</td>
                <td data-et="Tipo">{e.era_respuesta ? 'Respuesta' : 'Publicación'}</td>
                <td data-et="Texto" style={{ whiteSpace: 'pre-wrap' }}>{e.texto_eliminado}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p ref={estado} role="status" aria-label="Mensajes mostrados" tabIndex={-1} className="desc">
        Mostrando {pagina.entradas.length} {pagina.entradas.length === 1 ? 'mensaje eliminado' : 'mensajes eliminados'}.
      </p>
      {pagina.hayMas && (
        <button type="button" className="btn ghost" onClick={cargarMas} aria-disabled={pendiente || undefined}>
          {pendiente ? 'Cargando…' : 'Cargar más mensajes'}
        </button>
      )}
    </div>
  )
}
