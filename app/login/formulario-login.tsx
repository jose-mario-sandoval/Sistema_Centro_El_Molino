'use client'

import { useActionState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { iniciarSesion } from './acciones'

export function FormularioLogin() {
  const [estado, accion] = useActionState(iniciarSesion, null)
  const campos = estado && !estado.ok ? estado.campos : undefined

  return (
    <form action={accion} noValidate>
      {estado && !estado.ok && !campos && <div className="login-error" role="alert">{estado.error}</div>}
      <div className="field">
        <label htmlFor="correo">Correo</label>
        <input id="correo" name="correo" type="email" autoComplete="username" placeholder="tu@correo.org" required />
        {campos?.correo && <div className="campo-error">{campos.correo}</div>}
      </div>
      <div className="field">
        <label htmlFor="contrasena">Contraseña</label>
        <input id="contrasena" name="contrasena" type="password" autoComplete="current-password" required />
        {campos?.contrasena && <div className="campo-error">{campos.contrasena}</div>}
      </div>
      <BotonEnvio className="btn block" textoPendiente="Entrando…">
        Iniciar sesión
      </BotonEnvio>
    </form>
  )
}
