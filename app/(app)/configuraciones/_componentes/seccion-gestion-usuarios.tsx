'use client'

import { useCallback, useState } from 'react'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { siguienteNumeroAdministracion } from '@/lib/cuentas/administracion'
import { FilaCuenta } from './fila-cuenta'
import { ModalCambiarRol, type CambioDeRol } from './modal-cambiar-rol'
import { ModalCambiarUsuario } from './modal-cambiar-usuario'
import { ModalContrasenaTemporal } from './modal-contrasena-temporal'
import { ModalDesactivarCuenta } from './modal-desactivar-cuenta'
import { ModalNuevaCuenta } from './modal-nueva-cuenta'

export function SeccionGestionUsuarios({ cuentas, idPropio }: { cuentas: Cuenta[]; idPropio: string }) {
  const [creando, setCreando] = useState(false)
  const [conUsuario, setConUsuario] = useState<Cuenta | null>(null)
  const [conContrasena, setConContrasena] = useState<Cuenta | null>(null)
  const [aDesactivar, setADesactivar] = useState<Cuenta | null>(null)
  const [cambioDeRol, setCambioDeRol] = useState<CambioDeRol | null>(null)

  // El número que llevaría la próxima cuenta de Administración ("Administración N"): el servidor
  // vuelve a calcularlo al guardar; acá es para decirlo antes.
  const numeroAdministracion = siguienteNumeroAdministracion(cuentas.map((cuenta) => cuenta.nombre))

  const cerrarCreacion = useCallback(() => setCreando(false), [])
  const cerrarUsuario = useCallback(() => setConUsuario(null), [])
  const cerrarContrasena = useCallback(() => setConContrasena(null), [])
  const cerrarDesactivacion = useCallback(() => setADesactivar(null), [])
  const cerrarCambioDeRol = useCallback(() => setCambioDeRol(null), [])

  return (
    <section className="settings-section" aria-labelledby="titulo-gestion-usuarios">
      <h2 id="titulo-gestion-usuarios">Gestión de usuarios</h2>
      <div className="desc">
        Creá cuentas, asigná roles, poné contraseñas temporales y desactivá o reactivá cuentas. Cada persona edita su
        propio nombre y siglas; el usuario con el que entra lo ponés vos.
      </div>
      <div className="card">
        <div className="tabla-desplazable">
          <table className="user-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {cuentas.map((cuenta) => (
                <FilaCuenta
                  key={cuenta.id}
                  cuenta={cuenta}
                  esPropia={cuenta.id === idPropio}
                  alCambiarUsuario={() => setConUsuario(cuenta)}
                  alPonerContrasena={() => setConContrasena(cuenta)}
                  alDesactivar={() => setADesactivar(cuenta)}
                  alConfirmarRol={(rol) => setCambioDeRol({ cuenta, rol })}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="acciones-formulario">
          <button type="button" className="btn ghost" onClick={() => setCreando(true)}>
            + Nueva cuenta
          </button>
        </div>
      </div>
      <ModalNuevaCuenta abierto={creando} alCerrar={cerrarCreacion} numeroAdministracion={numeroAdministracion} />
      <ModalCambiarUsuario cuenta={conUsuario} alCerrar={cerrarUsuario} />
      <ModalContrasenaTemporal cuenta={conContrasena} alCerrar={cerrarContrasena} />
      <ModalDesactivarCuenta cuenta={aDesactivar} alCerrar={cerrarDesactivacion} />
      <ModalCambiarRol cambio={cambioDeRol} alCerrar={cerrarCambioDeRol} numeroAdministracion={numeroAdministracion} />
    </section>
  )
}
