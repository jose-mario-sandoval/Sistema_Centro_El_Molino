'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { iniciarSesion } from './acciones'

export function FormularioLogin() {
  const [estado, accion] = useActionState(iniciarSesion, null)
  // Controlado: React 19 reinicia los campos no controlados del formulario al terminar la acción,
  // y tras un error la persona perdería el usuario que ya escribió.
  const [usuario, setUsuario] = useState('')
  const campos = estado && !estado.ok ? estado.campos : undefined

  return (
    <form action={accion} noValidate>
      {estado && !estado.ok && !campos && <div className="login-error" role="alert">{estado.error}</div>}
      <div className="field">
        <label htmlFor="usuario">Usuario</label>
        <input
          id="usuario"
          name="usuario"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={usuario}
          onChange={(e) => setUsuario(e.target.value)}
        />
        {campos?.usuario && <div className="campo-error">{campos.usuario}</div>}
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
