"use client";

import { useTransition } from "react";
import { useAviso } from "@/components/ui/avisos";
import { Modal } from "@/components/ui/modal";
import type { Cuenta } from "@/lib/configuraciones/tipos";
import { eliminarCuenta } from "../acciones";
import { llamarAccion } from "./llamar-accion";

export function ModalEliminarCuenta({
  cuenta,
  alCerrar,
}: {
  cuenta: Cuenta | null;
  alCerrar: () => void;
}) {
  const aviso = useAviso();
  const [pendiente, iniciarTransicion] = useTransition();

  function confirmar() {
    // Sin `disabled` en el botón mientras corre: conserva el foco del teclado.
    if (!cuenta || pendiente) return;
    iniciarTransicion(async () => {
      const resultado = await llamarAccion(() =>
        eliminarCuenta({ id: cuenta.id }),
      );
      aviso(
        resultado.ok ? `Cuenta eliminada: ${cuenta.nombre}.` : resultado.error,
      );
      alCerrar();
    });
  }

  return (
    <Modal
      titulo="Eliminar cuenta"
      abierto={cuenta !== null}
      alCerrar={alCerrar}
      bloquearCierre={pendiente}
    >
      {cuenta && (
        <>
          <p>
            ¿Eliminar para siempre la cuenta de <strong>{cuenta.nombre}</strong>
            ?
          </p>
          <p className="hint">
            Esto no se puede deshacer. Se borran también sus mensajes, eventos
            del calendario, ausencias y elecciones de comida. Si solo querés que
            no entre más, mejor desactivala.
          </p>
          <div className="modal-foot">
            <button
              type="button"
              className="btn ghost"
              onClick={alCerrar}
              disabled={pendiente}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn danger"
              onClick={confirmar}
              aria-busy={pendiente}
            >
              {pendiente ? "Eliminando…" : "Eliminar para siempre"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
