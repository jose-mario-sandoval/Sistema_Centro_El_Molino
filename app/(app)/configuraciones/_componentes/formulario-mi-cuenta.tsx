'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { ETIQUETA_ROL, ROLES, type Rol } from '@/lib/perfiles/roles'
import { guardarMiCuenta } from '../acciones'
import { accionDeFormulario } from './llamar-accion'
import { useAvisoDeResultado } from './usar-aviso-resultado'

const guardarMiCuentaSegura = accionDeFormulario(guardarMiCuenta)

export function FormularioMiCuenta(props: { nombre: string; siglas: string; usuario: string; rol: Rol }) {
  const [estado, accion] = useActionState(guardarMiCuentaSegura, null)
  const [nombre, setNombre] = useState(props.nombre)
  const [siglas, setSiglas] = useState(props.siglas)
  const campos = estado && !estado.ok ? estado.campos : undefined
  // La casa no ve el nombre real de Administración: el suyo es genérico y lo pone la app.
  const nombreFijo = props.rol === 'administracion'

  // Tras guardar, los campos muestran lo que quedó en la base (sin espacios, siglas en mayúsculas).
  // Se ajusta durante el render al llegar un resultado nuevo, sin efecto.
  const [estadoAplicado, setEstadoAplicado] = useState(estado)
  if (estado !== estadoAplicado) {
    setEstadoAplicado(estado)
    if (estado?.ok) {
      setNombre(estado.data.nombre)
      setSiglas(estado.data.siglas)
    }
  }
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
            readOnly={nombreFijo}
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          {nombreFijo && (
            <div className="hint">En Administración el nombre lo pone la app: la casa no ve nombres reales.</div>
          )}
          {campos?.nombre && <div className="campo-error">{campos.nombre}</div>}
        </div>
        <div className="field">
          <label htmlFor="mi-siglas">Siglas</label>
          <input
            id="mi-siglas"
            name="siglas"
            maxLength={6}
            required
            readOnly={nombreFijo}
            value={siglas}
            onChange={(e) => setSiglas(e.target.value)}
          />
          {campos?.siglas && <div className="campo-error">{campos.siglas}</div>}
        </div>
        <div className="field">
          <label htmlFor="mi-usuario">Usuario</label>
          {/* Sin `name`: no viaja con el formulario. Lo cambia el Director desde Gestión de usuarios. */}
          <input id="mi-usuario" value={props.usuario} readOnly autoComplete="username" />
          <div className="hint">Con este usuario iniciás sesión. Para cambiarlo, hablá con el Director.</div>
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
      {!nombreFijo && (
        <div className="acciones-formulario">
          <BotonEnvio>Guardar cambios</BotonEnvio>
        </div>
      )}
    </form>
  )
}
