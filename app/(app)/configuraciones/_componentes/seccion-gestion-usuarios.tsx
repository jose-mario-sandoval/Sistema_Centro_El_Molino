'use client'

import { useCallback, useState } from 'react'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { FilaCuenta } from './fila-cuenta'
import { ModalCambiarRol, type CambioDeRol } from './modal-cambiar-rol'
import { ModalContrasenaTemporal } from './modal-contrasena-temporal'
import { ModalDesactivarCuenta } from './modal-desactivar-cuenta'
import { ModalNuevaCuenta } from './modal-nueva-cuenta'

export function SeccionGestionUsuarios({ cuentas, idPropio }: { cuentas: Cuenta[]; idPropio: string }) {
  const [creando, setCreando] = useState(false)
  const [conContrasena, setConContrasena] = useState<Cuenta | null>(null)
  const [aDesactivar, setADesactivar] = useState<Cuenta | null>(null)
  const [cambioDeRol, setCambioDeRol] = useState<CambioDeRol | null>(null)

  const cerrarCreacion = useCallback(() => setCreando(false), [])
  const cerrarContrasena = useCallback(() => setConContrasena(null), [])
  const cerrarDesactivacion = useCallback(() => setADesactivar(null), [])
  const cerrarCambioDeRol = useCallback(() => setCambioDeRol(null), [])

  return (
    <section className="settings-section" aria-labelledby="titulo-gestion-usuarios">
      <h2 id="titulo-gestion-usuarios">Gestión de usuarios</h2>
      <div className="desc">
        Creá cuentas, asigná roles, poné contraseñas temporales y desactivá o reactivá cuentas. Cada persona edita su
        propio nombre, siglas y correo.
      </div>
      <div className="card">
        <div className="tabla-desplazable">
          <table className="user-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
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
      <ModalNuevaCuenta abierto={creando} alCerrar={cerrarCreacion} />
      <ModalContrasenaTemporal cuenta={conContrasena} alCerrar={cerrarContrasena} />
      <ModalDesactivarCuenta cuenta={aDesactivar} alCerrar={cerrarDesactivacion} />
      <ModalCambiarRol cambio={cambioDeRol} alCerrar={cerrarCambioDeRol} />
    </section>
  )
}
