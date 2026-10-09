'use client'

import { useEffect, useState, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Modal } from '@/components/ui/modal'
import type { Resultado } from '@/lib/acciones/resultado'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { textoLoQueSeBorra, textoLoQueSeConserva, type ResumenEliminacion } from '@/lib/cuentas/eliminar'
import { eliminarCuenta, resumenParaEliminarCuenta } from '../acciones'
import { llamarAccion } from './llamar-accion'

export function ModalEliminarCuenta({ cuenta, alCerrar }: { cuenta: Cuenta | null; alCerrar: () => void }) {
  // Montado solo mientras está abierto (y uno por cuenta): cada apertura vuelve a leer qué se perdería.
  return cuenta ? <ConfirmarEliminacion key={cuenta.id} cuenta={cuenta} alCerrar={alCerrar} /> : null
}

/**
 * Eliminar no tiene vuelta atrás: antes de confirmar se dice, con números, qué se borra y qué se
 * conserva. El botón no se puede usar hasta que eso esté a la vista.
 */
function ConfirmarEliminacion({ cuenta, alCerrar }: { cuenta: Cuenta; alCerrar: () => void }) {
  const aviso = useAviso()
  const [resumen, setResumen] = useState<Resultado<ResumenEliminacion> | null>(null)
  const [pendiente, iniciarTransicion] = useTransition()

  useEffect(() => {
    let vigente = true
    void llamarAccion(() => resumenParaEliminarCuenta({ id: cuenta.id })).then((resultado) => {
      if (vigente) setResumen(resultado)
    })
    return () => {
      vigente = false
    }
  }, [cuenta.id])

  function confirmar() {
    // Sin `disabled` mientras corre: conserva el foco del teclado.
    if (pendiente || !resumen?.ok) return
    iniciarTransicion(async () => {
      const resultado = await llamarAccion(() => eliminarCuenta({ id: cuenta.id }))
      aviso(resultado.ok ? `Cuenta eliminada: ${cuenta.nombre}.` : resultado.error)
      alCerrar()
    })
  }

  const conserva = resumen?.ok ? textoLoQueSeConserva(resumen.data) : null

  return (
    <Modal titulo="Eliminar cuenta" abierto alCerrar={alCerrar} bloquearCierre={pendiente}>
      <p>
        ¿Eliminar definitivamente la cuenta de <strong>{cuenta.nombre}</strong> ({cuenta.usuario})?
      </p>
      {resumen === null ? (
        <p className="hint" role="status">
          Buscando lo que tiene esta cuenta…
        </p>
      ) : resumen.ok ? (
        <>
          <p className="hint">{textoLoQueSeBorra(resumen.data)}</p>
          {conserva && <p className="hint">{conserva}</p>}
          <p>
            <strong>No se puede deshacer.</strong> Si solo querés que no entre, dejala desactivada.
          </p>
        </>
      ) : (
        <p className="campo-error" role="alert">
          {resumen.error}
        </p>
      )}
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={alCerrar} disabled={pendiente}>
          Cancelar
        </button>
        {resumen?.ok && (
          <button type="button" className="btn danger" onClick={confirmar} aria-busy={pendiente}>
            {pendiente ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        )}
      </div>
    </Modal>
  )
}
