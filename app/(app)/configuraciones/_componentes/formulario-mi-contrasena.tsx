'use client'

import { useActionState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { cambiarMiContrasena } from '../acciones'
import { useAvisoDeResultado } from './usar-aviso-resultado'

export function FormularioMiContrasena() {
  const [estado, accion] = useActionState(cambiarMiContrasena, null)
  const campos = estado && !estado.ok ? estado.campos : undefined
  useAvisoDeResultado(estado, 'Contraseña actualizada.')

  return (
    <form action={accion} noValidate>
      <div className="settings-grid card">
        <div className="field">
          <label htmlFor="contrasena-actual">Contraseña actual</label>
          <input id="contrasena-actual" name="actual" type="password" autoComplete="current-password" required />
          {campos?.actual && <div className="campo-error">{campos.actual}</div>}
        </div>
        <div className="field">
          <label htmlFor="contrasena-nueva">Contraseña nueva</label>
          <input
            id="contrasena-nueva"
            name="nueva"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <div className="hint">Al menos 8 caracteres.</div>
          {campos?.nueva && <div className="campo-error">{campos.nueva}</div>}
        </div>
        <div className="field">
          <label htmlFor="contrasena-confirmacion">Repetir contraseña</label>
          <input
            id="contrasena-confirmacion"
            name="confirmacion"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          {campos?.confirmacion && <div className="campo-error">{campos.confirmacion}</div>}
        </div>
      </div>
      <div className="acciones-formulario">
        <BotonEnvio>Cambiar contraseña</BotonEnvio>
      </div>
    </form>
  )
}
