'use client'

import { useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Modal } from '@/components/ui/modal'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { cambiarEstadoCuenta } from '../acciones'
import { llamarAccion } from './llamar-accion'

export function ModalDesactivarCuenta({ cuenta, alCerrar }: { cuenta: Cuenta | null; alCerrar: () => void }) {
  const aviso = useAviso()
  const [pendiente, iniciarTransicion] = useTransition()

  function confirmar() {
    if (!cuenta) return
    iniciarTransicion(async () => {
      const resultado = await llamarAccion(() => cambiarEstadoCuenta({ id: cuenta.id, activo: false }))
      aviso(resultado.ok ? `Cuenta desactivada: ${cuenta.nombre}.` : resultado.error)
      alCerrar()
    })
  }

  return (
    <Modal titulo="Desactivar cuenta" abierto={cuenta !== null} alCerrar={alCerrar}>
      {cuenta && (
        <>
          <p>
            ¿Desactivar la cuenta de <strong>{cuenta.nombre}</strong>?
          </p>
          <p className="hint">
            No podrá iniciar sesión, no aparecerá en las comidas ni recibirá avisos. Sus mensajes se conservan y podés
            reactivarla cuando quieras.
          </p>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={alCerrar} disabled={pendiente}>
              Cancelar
            </button>
            <button type="button" className="btn danger" onClick={confirmar} disabled={pendiente}>
              {pendiente ? 'Desactivando…' : 'Desactivar'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
