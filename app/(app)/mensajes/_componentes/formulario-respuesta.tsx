'use client'

import { startTransition, useActionState, useRef } from 'react'
import { useAviso } from '@/components/ui/avisos'
import type { Resultado } from '@/lib/acciones/resultado'
import { LARGO_MAXIMO_MENSAJE } from '@/lib/mensajes/feed'
import { responderMensaje } from '../acciones'

export function FormularioRespuesta({
  padreId,
  alResponder,
}: {
  padreId: string
  alResponder: (id: string, texto: string) => void
}) {
  const aviso = useAviso()
  const formulario = useRef<HTMLFormElement>(null)
  const [estado, accion, pendiente] = useActionState(
    async (previo: Resultado<{ id: string }> | null, formData: FormData) => {
      const resultado = await responderMensaje(previo, formData)
      if (resultado.ok) {
        formulario.current?.reset()
        alResponder(resultado.data.id, String(formData.get('texto')).trim())
      } else if (!resultado.campos?.texto) {
        aviso(resultado.error)
      }
      return resultado
    },
    null,
  )
  const errorTexto = estado && !estado.ok ? estado.campos?.texto : undefined

  return (
    <>
      <form
        ref={formulario}
        className="reply-compose"
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          const datos = new FormData(e.currentTarget)
          startTransition(() => accion(datos))
        }}
      >
        <input type="hidden" name="padreId" value={padreId} />
        <input
          name="texto"
          aria-label="Respuesta"
          placeholder="Escribí una respuesta…"
          maxLength={LARGO_MAXIMO_MENSAJE}
          aria-invalid={errorTexto ? true : undefined}
        />
        <button type="submit" className="btn small" disabled={pendiente} aria-busy={pendiente}>
          {pendiente ? 'Enviando…' : 'Enviar'}
        </button>
      </form>
      {errorTexto && (
        <div className="campo-error" style={{ marginLeft: 16 }}>
          {errorTexto}
        </div>
      )}
    </>
  )
}
