'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { fallo, type Resultado } from '@/lib/acciones/resultado'
import { confirmarCena } from '../acciones'

export function FormularioConfirmarCena({ token }: { token: string }) {
  const [confirmado, setConfirmado] = useState(false)
  const [estado, accion] = useActionState(
    async (_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> => {
      let resultado: Resultado<null>
      try {
        resultado = await confirmarCena(null, formData)
      } catch {
        resultado = fallo('No se pudo confirmar. Revisá tu conexión e intentá de nuevo.')
      }
      if (resultado.ok) setConfirmado(true)
      return resultado
    },
    null,
  )

  if (confirmado) return <p className="aviso-exito">¡Listo! Tu cena quedó confirmada.</p>

  return (
    <form action={accion} className="form-confirmar-cena">
      <input type="hidden" name="token" value={token} />
      <div className="field">
        <label htmlFor="cc-nombre">Tu nombre</label>
        <input id="cc-nombre" name="nombre" required maxLength={120} />
      </div>
      <div className="field">
        <label htmlFor="cc-cantidad">¿Cuántas personas (contándote a vos)?</label>
        <input id="cc-cantidad" name="cantidad_personas" type="number" min={1} max={10} defaultValue={1} required />
      </div>
      {estado && !estado.ok && <div className="campo-error">{estado.error}</div>}
      <BotonEnvio>Confirmar cena</BotonEnvio>
    </form>
  )
}
