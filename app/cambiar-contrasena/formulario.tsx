'use client'

import { useActionState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { cambiarContrasenaObligatoria } from './acciones'

export function FormularioCambioContrasena() {
  const [estado, accion] = useActionState(cambiarContrasenaObligatoria, null)
  const campos = estado && !estado.ok ? estado.campos : undefined

  return (
    <form action={accion} noValidate>
      {estado && !estado.ok && !campos && <div className="login-error" role="alert">{estado.error}</div>}
      <div className="field">
        <label htmlFor="nueva">Contraseña nueva</label>
        <input id="nueva" name="nueva" type="password" autoComplete="new-password" minLength={8} required />
        {campos?.nueva && <div className="campo-error">{campos.nueva}</div>}
      </div>
      <div className="field">
        <label htmlFor="confirmacion">Repetir contraseña</label>
        <input id="confirmacion" name="confirmacion" type="password" autoComplete="new-password" minLength={8} required />
        {campos?.confirmacion && <div className="campo-error">{campos.confirmacion}</div>}
      </div>
      <BotonEnvio className="btn block">Guardar contraseña</BotonEnvio>
    </form>
  )
}
