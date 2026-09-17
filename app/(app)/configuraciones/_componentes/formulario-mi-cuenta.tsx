'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { ETIQUETA_ROL, ROLES, type Rol } from '@/lib/perfiles/roles'
import { guardarMiCuenta } from '../acciones'
import { accionDeFormulario } from './llamar-accion'
import { useAvisoDeResultado } from './usar-aviso-resultado'

const guardarMiCuentaSegura = accionDeFormulario(guardarMiCuenta)

export function FormularioMiCuenta(props: { nombre: string; siglas: string; correo: string; rol: Rol }) {
  const [estado, accion] = useActionState(guardarMiCuentaSegura, null)
  const [nombre, setNombre] = useState(props.nombre)
  const [siglas, setSiglas] = useState(props.siglas)
  const [correo, setCorreo] = useState(props.correo)
  const campos = estado && !estado.ok ? estado.campos : undefined
  useAvisoDeResultado(estado, 'Cuenta actualizada.')

  return (
    <form action={accion} noValidate>
      <div className="settings-grid card">
        <div className="field">
          <label htmlFor="mi-nombre">Nombre</label>
          <input
            id="mi-nombre"
            name="nombre"
            autoComplete="name"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          {campos?.nombre && <div className="campo-error">{campos.nombre}</div>}
        </div>
        <div className="field">
          <label htmlFor="mi-siglas">Siglas</label>
          <input
            id="mi-siglas"
            name="siglas"
            maxLength={6}
            required
            value={siglas}
            onChange={(e) => setSiglas(e.target.value)}
          />
          {campos?.siglas && <div className="campo-error">{campos.siglas}</div>}
        </div>
        <div className="field">
          <label htmlFor="mi-correo">Correo</label>
          <input
            id="mi-correo"
            name="correo"
            type="email"
            autoComplete="email"
            required
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
          <div className="hint">Es el correo con el que iniciás sesión.</div>
          {campos?.correo && <div className="campo-error">{campos.correo}</div>}
        </div>
        <div className="field">
          <label htmlFor="mi-rol">Rol</label>
          <select id="mi-rol" defaultValue={props.rol} disabled>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </select>
          <div className="hint">
            No podés cambiar tu propio rol.
            {props.rol === 'director' && ' Podés cambiar el rol de otras cuentas más abajo.'}
          </div>
        </div>
      </div>
      <div className="acciones-formulario">
        <BotonEnvio>Guardar cambios</BotonEnvio>
      </div>
    </form>
  )
}
