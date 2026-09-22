'use client'

import { useActionState, useState } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { editarMensajePropio } from '../acciones'

export function FormularioEditarPropio({ id, textoActual }: { id: string; textoActual: string }) {
  const aviso = useAviso()
  const [texto, setTexto] = useState(textoActual)
  const [estado, accion] = useActionState(
    async (_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> => {
      let resultado: Resultado<null>
      try {
        resultado = await editarMensajePropio(null, formData)
      } catch {
        resultado = fallo('No se pudo guardar. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) aviso('Corregido. Esperando aprobación de nuevo.')
      else aviso(resultado.error)
      return resultado
    },
    null,
  )

  return (
    <form action={accion} className="form-editar-propio">
      <input type="hidden" name="id" value={id} />
      <textarea name="texto" value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={2000} required />
      {estado && !estado.ok && <div className="campo-error">{estado.error}</div>}
      <BotonEnvio className="btn small">Corregir y reenviar</BotonEnvio>
    </form>
  )
}
