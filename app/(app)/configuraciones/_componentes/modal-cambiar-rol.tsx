'use client'

import { useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Modal } from '@/components/ui/modal'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { nombreAdministracion, siglasAdministracion } from '@/lib/cuentas/administracion'
import { ETIQUETA_ROL, type Rol } from '@/lib/perfiles/roles'
import { cambiarRolCuenta } from '../acciones'
import { llamarAccion } from './llamar-accion'

export type CambioDeRol = { cuenta: Cuenta; rol: Rol }

/**
 * Confirmación para dar o quitar el rol Director (cambia quién gestiona cuentas y horas límite) y
 * para pasar una cuenta a Administración (cambia su nombre por uno genérico).
 */
export function ModalCambiarRol({
  cambio,
  alCerrar,
  numeroAdministracion,
}: {
  cambio: CambioDeRol | null
  alCerrar: () => void
  /** El número que llevaría la cuenta si pasa a Administración ("Administración N"). */
  numeroAdministracion: number
}) {
  const aviso = useAviso()
  const [pendiente, iniciarTransicion] = useTransition()

  const daDirector = cambio?.rol === 'director'
  const quitaDirector = cambio?.cuenta.rol === 'director' && !daDirector
  const aAdministracion = cambio?.rol === 'administracion'
  const nombreNuevo = nombreAdministracion(numeroAdministracion)

  function confirmar() {
    // Sin `disabled` en el botón mientras corre: conserva el foco del teclado.
    if (!cambio || pendiente) return
    const { cuenta, rol } = cambio
    iniciarTransicion(async () => {
      const resultado = await llamarAccion(() => cambiarRolCuenta({ id: cuenta.id, rol }))
      aviso(
        !resultado.ok
          ? resultado.error
          : aAdministracion
            ? `${cuenta.nombre} pasó a Administración.`
            : `Rol actualizado para ${cuenta.nombre}.`,
      )
      alCerrar()
    })
  }

  return (
    <Modal titulo="Cambiar rol" abierto={cambio !== null} alCerrar={alCerrar} bloquearCierre={pendiente}>
      {cambio && (
        <>
          <p>
            {daDirector ? '¿Dar el rol Director a ' : aAdministracion ? '¿Pasar a Administración a ' : '¿Quitar el rol Director a '}
            <strong>{cambio.cuenta.nombre}</strong>?
            {quitaDirector && !aAdministracion && ` Pasará a tener el rol ${ETIQUETA_ROL[cambio.rol]}.`}
          </p>
          {aAdministracion && (
            <p className="hint">
              Va a llamarse «{nombreNuevo}» ({siglasAdministracion(numeroAdministracion)}): la casa no ve el nombre
              real de Administración.
            </p>
          )}
          {(daDirector || quitaDirector) && (
            <p className="hint">
              {daDirector
                ? 'Podrá gestionar cuentas, roles y contraseñas temporales, y cambiar las horas límite.'
                : 'Dejará de poder gestionar cuentas, roles y contraseñas temporales, y de cambiar las horas límite.'}
            </p>
          )}
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={alCerrar} disabled={pendiente}>
              Cancelar
            </button>
            <button type="button" className="btn" onClick={confirmar} aria-busy={pendiente}>
              {pendiente
                ? 'Cambiando…'
                : daDirector
                  ? 'Dar rol Director'
                  : aAdministracion
                    ? 'Pasar a Administración'
                    : 'Quitar rol Director'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
