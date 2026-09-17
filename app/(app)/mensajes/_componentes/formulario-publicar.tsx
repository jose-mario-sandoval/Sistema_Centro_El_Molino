'use client'

import { startTransition, useActionState, useRef } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { llamarAccion } from '@/lib/acciones/llamar'
import type { Resultado } from '@/lib/acciones/resultado'
import { LARGO_MAXIMO_MENSAJE } from '@/lib/mensajes/feed'
import { publicarMensaje } from '../acciones'
import { useIdEnvio } from './use-id-envio'

export function FormularioPublicar({ alPublicar }: { alPublicar: (id: string, texto: string) => void }) {
  const aviso = useAviso()
  const formulario = useRef<HTMLFormElement>(null)
  const idEnvio = useIdEnvio()
  const [estado, accion, pendiente] = useActionState(
    async (previo: Resultado<{ id: string }> | null, formData: FormData) => {
      // Si la acción no llega al servidor, vuelve un fallo (no un error que tire la sección) y el formulario
      // no se reinicia (onSubmit con preventDefault, sin `action`): el texto escrito queda para reintentar.
      const resultado = await llamarAccion(() => publicarMensaje(previo, formData))
      if (resultado.ok) {
        idEnvio.confirmar(resultado.data.id)
        alPublicar(resultado.data.id, String(formData.get('texto')).trim())
        formulario.current?.reset()
      } else if (!resultado.campos?.texto) {
        aviso(resultado.error)
      }
      return resultado
    },
    null,
  )
  const errorTexto = estado && !estado.ok ? estado.campos?.texto : undefined

  return (
    <form
      ref={formulario}
      className="compose"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const datos = new FormData(e.currentTarget)
        idEnvio.asignar(datos)
        startTransition(() => accion(datos))
      }}
    >
      <textarea
        name="texto"
        aria-label="Nuevo mensaje"
        placeholder="¿Qué querés compartir con la casa?"
        maxLength={LARGO_MAXIMO_MENSAJE}
        aria-invalid={errorTexto ? true : undefined}
      />
      {errorTexto && <div className="campo-error">{errorTexto}</div>}
      <div className="compose-foot">
        <button type="submit" className="btn" disabled={pendiente} aria-busy={pendiente}>
          {pendiente ? 'Publicando…' : 'Publicar'}
        </button>
      </div>
    </form>
  )
}
