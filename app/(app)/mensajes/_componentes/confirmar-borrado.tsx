'use client'

import { Modal } from '@/components/ui/modal'
import type { PedidoBorrado } from './tarjeta-mensaje'

export function ConfirmarBorrado({
  pedido,
  nombreAutor,
  esPropio,
  pendiente,
  alConfirmar,
  alCerrar,
}: {
  pedido: PedidoBorrado | null
  nombreAutor: string
  esPropio: boolean
  pendiente: boolean
  alConfirmar: () => void
  alCerrar: () => void
}) {
  const cosa = pedido?.esRespuesta ? 'respuesta' : 'mensaje'
  const respuestas = pedido && !pedido.esRespuesta ? pedido.respuestas : 0

  return (
    <Modal titulo={pedido?.esRespuesta ? 'Eliminar respuesta' : 'Eliminar mensaje'} abierto={pedido !== null} alCerrar={alCerrar}>
      <p>
        {esPropio
          ? `¿Eliminar tu ${cosa}? No se puede deshacer.`
          : `Vas a eliminar ${pedido?.esRespuesta ? 'la respuesta' : 'el mensaje'} de ${nombreAutor}. Quedará una copia en el registro de moderación.`}
      </p>
      {respuestas > 0 && (
        <p style={{ marginTop: 8 }}>
          {respuestas === 1 ? 'También se eliminará su respuesta.' : `También se eliminarán sus ${respuestas} respuestas.`}
        </p>
      )}
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={alCerrar} disabled={pendiente}>
          Cancelar
        </button>
        <button type="button" className="btn danger" onClick={alConfirmar} disabled={pendiente} aria-busy={pendiente}>
          {pendiente ? 'Eliminando…' : 'Eliminar'}
        </button>
      </div>
    </Modal>
  )
}
