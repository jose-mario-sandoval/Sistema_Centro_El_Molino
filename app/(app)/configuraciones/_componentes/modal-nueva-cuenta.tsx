'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { Modal } from '@/components/ui/modal'
import { nombreAdministracion, siglasAdministracion, usuarioSugeridoAdministracion } from '@/lib/cuentas/administracion'
import { ETIQUETA_ROL, ROLES, type Rol } from '@/lib/perfiles/roles'
import { crearNuevaCuenta } from '../acciones'
import { CampoContrasenaTemporal, ContrasenaParaEntregar } from './campo-contrasena-temporal'
import { accionDeFormulario } from './llamar-accion'
import { SelectControlado } from './select-controlado'
import { useAvisoDeResultado } from './usar-aviso-resultado'

const crearNuevaCuentaSegura = accionDeFormulario(crearNuevaCuenta)

export function ModalNuevaCuenta({
  abierto,
  alCerrar,
  numeroAdministracion,
}: {
  abierto: boolean
  alCerrar: () => void
  /** El número que llevaría una cuenta nueva de Administración ("Administración N"). */
  numeroAdministracion: number
}) {
  // Montado solo mientras está abierto: cada apertura empieza con el formulario vacío.
  return abierto ? <FormularioNuevaCuenta alCerrar={alCerrar} numeroAdministracion={numeroAdministracion} /> : null
}

function FormularioNuevaCuenta({ alCerrar, numeroAdministracion }: { alCerrar: () => void; numeroAdministracion: number }) {
  const [estado, accion, pendiente] = useActionState(crearNuevaCuentaSegura, null)
  const [rol, setRol] = useState<Rol>('residente')
  const [usuario, setUsuario] = useState('')
  const [nombre, setNombre] = useState('')
  const [siglas, setSiglas] = useState('')
  const [contrasena, setContrasena] = useState('')
  const campos = estado && !estado.ok ? estado.campos : undefined
  useAvisoDeResultado(estado, null)

  // La casa no ve el nombre real de Administración: esa cuenta no lleva nombre escrito.
  const esAdministracion = rol === 'administracion'
  const usuarioSugerido = usuarioSugeridoAdministracion(numeroAdministracion)

  function cambiarRol(nuevo: Rol) {
    // Al pasar a Administración se propone su usuario (si no se escribió otro); al salir, se retira
    // la propuesta que nadie tocó.
    if (nuevo === 'administracion' && usuario.trim() === '') setUsuario(usuarioSugerido)
    if (nuevo !== 'administracion' && usuario === usuarioSugerido) setUsuario('')
    setRol(nuevo)
  }

  // Mientras se crea no se puede cerrar; con la contraseña a la vista, solo con "Listo".
  return (
    <Modal titulo="Nueva cuenta" abierto alCerrar={alCerrar} bloquearCierre={pendiente || estado?.ok}>
      {estado?.ok ? (
        <ContrasenaParaEntregar
          mensaje={`Cuenta creada: ${estado.data.nombre}. Usuario: ${estado.data.usuario}.`}
          contrasena={contrasena}
          alCerrar={alCerrar}
        />
      ) : (
        <form action={accion} noValidate>
          <div className="field">
            <label htmlFor="nueva-rol">Rol</label>
            {/* SelectControlado: tras un error de validación, el reseteo de React no debe cambiar el rol elegido. */}
            <SelectControlado id="nueva-rol" name="rol" value={rol} onChange={(e) => cambiarRol(e.target.value as Rol)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL[r]}
                </option>
              ))}
            </SelectControlado>
            {campos?.rol && <div className="campo-error">{campos.rol}</div>}
          </div>
          <div className="field">
            <label htmlFor="nueva-usuario">Usuario</label>
            <input
              id="nueva-usuario"
              name="usuario"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
            <div className="hint">Con esto va a entrar. Letras sin tilde, números, punto o guion. Ejemplo: r.flores</div>
            {campos?.usuario && <div className="campo-error">{campos.usuario}</div>}
          </div>
          {esAdministracion ? (
            // Dentro de un .field: ocupa el lugar (y el espacio) de los campos que no se piden.
            <div className="field">
              <p className="hint">
                Se va a llamar «{nombreAdministracion(numeroAdministracion)}» (
                {siglasAdministracion(numeroAdministracion)}): la casa no ve el nombre real de Administración.
              </p>
            </div>
          ) : (
            <>
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
            </>
          )}
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
