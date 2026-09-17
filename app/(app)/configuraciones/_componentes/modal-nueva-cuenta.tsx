'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { Modal } from '@/components/ui/modal'
import { ETIQUETA_ROL, ROLES, type Rol } from '@/lib/perfiles/roles'
import { crearNuevaCuenta } from '../acciones'
import { CampoContrasenaTemporal, ContrasenaParaEntregar } from './campo-contrasena-temporal'
import { accionDeFormulario } from './llamar-accion'
import { SelectControlado } from './select-controlado'
import { useAvisoDeResultado } from './usar-aviso-resultado'

const crearNuevaCuentaSegura = accionDeFormulario(crearNuevaCuenta)

export function ModalNuevaCuenta({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  // Montado solo mientras está abierto: cada apertura empieza con el formulario vacío.
  return abierto ? <FormularioNuevaCuenta alCerrar={alCerrar} /> : null
}

function FormularioNuevaCuenta({ alCerrar }: { alCerrar: () => void }) {
  const [estado, accion, pendiente] = useActionState(crearNuevaCuentaSegura, null)
  const [nombre, setNombre] = useState('')
  const [siglas, setSiglas] = useState('')
  const [correo, setCorreo] = useState('')
  const [rol, setRol] = useState<Rol>('residente')
  const [contrasena, setContrasena] = useState('')
  const campos = estado && !estado.ok ? estado.campos : undefined
  useAvisoDeResultado(estado, null)

  // Mientras se crea no se puede cerrar; con la contraseña a la vista, solo con "Listo".
  return (
    <Modal titulo="Nueva cuenta" abierto alCerrar={alCerrar} bloquearCierre={pendiente || estado?.ok}>
      {estado?.ok ? (
        <ContrasenaParaEntregar
          mensaje={`Cuenta creada para ${nombre.trim()} (${correo.trim().toLowerCase()}).`}
          contrasena={contrasena}
          alCerrar={alCerrar}
        />
      ) : (
        <form action={accion} noValidate>
          <div className="field">
            <label htmlFor="nueva-nombre">Nombre completo</label>
            <input
              id="nueva-nombre"
              name="nombre"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
            />
            {campos?.nombre && <div className="campo-error">{campos.nombre}</div>}
          </div>
          <div className="field">
            <label htmlFor="nueva-siglas">Siglas</label>
            <input
              id="nueva-siglas"
              name="siglas"
              maxLength={6}
              required
              value={siglas}
              onChange={(e) => setSiglas(e.target.value)}
            />
            {campos?.siglas && <div className="campo-error">{campos.siglas}</div>}
          </div>
          <div className="field">
            <label htmlFor="nueva-correo">Correo</label>
            <input
              id="nueva-correo"
              name="correo"
              type="email"
              autoComplete="off"
              required
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
            />
            {campos?.correo && <div className="campo-error">{campos.correo}</div>}
          </div>
          <div className="field">
            <label htmlFor="nueva-rol">Rol</label>
            {/* SelectControlado: tras un error de validación, el reseteo de React no debe cambiar el rol elegido. */}
            <SelectControlado id="nueva-rol" name="rol" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL[r]}
                </option>
              ))}
            </SelectControlado>
            {campos?.rol && <div className="campo-error">{campos.rol}</div>}
          </div>
          <CampoContrasenaTemporal valor={contrasena} alCambiar={setContrasena} error={campos?.contrasena} />
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={alCerrar} disabled={pendiente}>
              Cancelar
            </button>
            <BotonEnvio textoPendiente="Creando…">Crear cuenta</BotonEnvio>
          </div>
        </form>
      )}
    </Modal>
  )
}
