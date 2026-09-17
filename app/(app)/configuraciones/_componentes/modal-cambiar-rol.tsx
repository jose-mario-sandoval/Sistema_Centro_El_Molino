'use client'

import { useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Modal } from '@/components/ui/modal'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { ETIQUETA_ROL, type Rol } from '@/lib/perfiles/roles'
import { cambiarRolCuenta } from '../acciones'
import { llamarAccion } from './llamar-accion'

export type CambioDeRol = { cuenta: Cuenta; rol: Rol }

/** Confirmación para dar o quitar el rol Director: cambia quién gestiona cuentas y horas límite. */
export function ModalCambiarRol({ cambio, alCerrar }: { cambio: CambioDeRol | null; alCerrar: () => void }) {
  const aviso = useAviso()
  const [pendiente, iniciarTransicion] = useTransition()

  function confirmar() {
    // Sin `disabled` en el botón mientras corre: conserva el foco del teclado.
    if (!cambio || pendiente) return
    const { cuenta, rol } = cambio
    iniciarTransicion(async () => {
      const resultado = await llamarAccion(() => cambiarRolCuenta({ id: cuenta.id, rol }))
      aviso(resultado.ok ? `Rol actualizado para ${cuenta.nombre}.` : resultado.error)
      alCerrar()
    })
  }

  const daDirector = cambio?.rol === 'director'

  return (
    <Modal titulo="Cambiar rol" abierto={cambio !== null} alCerrar={alCerrar} bloquearCierre={pendiente}>
      {cambio && (
        <>
          <p>
            {daDirector ? '¿Dar el rol Director a ' : '¿Quitar el rol Director a '}
            <strong>{cambio.cuenta.nombre}</strong>?
            {!daDirector && ` Pasará a tener el rol ${ETIQUETA_ROL[cambio.rol]}.`}
          </p>
          <p className="hint">
            {daDirector
              ? 'Podrá gestionar cuentas, roles y contraseñas temporales, y cambiar las horas límite.'
              : 'Dejará de poder gestionar cuentas, roles y contraseñas temporales, y de cambiar las horas límite.'}
          </p>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={alCerrar} disabled={pendiente}>
              Cancelar
            </button>
            <button type="button" className="btn" onClick={confirmar} aria-busy={pendiente}>
              {pendiente ? 'Cambiando…' : daDirector ? 'Dar rol Director' : 'Quitar rol Director'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
