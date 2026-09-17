'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { Modal } from '@/components/ui/modal'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { ponerContrasenaTemporal } from '../acciones'
import { CampoContrasenaTemporal, ContrasenaParaEntregar } from './campo-contrasena-temporal'
import { accionDeFormulario } from './llamar-accion'
import { useAvisoDeResultado } from './usar-aviso-resultado'

const ponerContrasenaTemporalSegura = accionDeFormulario(ponerContrasenaTemporal)

export function ModalContrasenaTemporal({ cuenta, alCerrar }: { cuenta: Cuenta | null; alCerrar: () => void }) {
  return (
    <Modal titulo="Contraseña temporal" abierto={cuenta !== null} alCerrar={alCerrar}>
      {cuenta && <FormularioContrasenaTemporal cuenta={cuenta} alCerrar={alCerrar} />}
    </Modal>
  )
}

function FormularioContrasenaTemporal({ cuenta, alCerrar }: { cuenta: Cuenta; alCerrar: () => void }) {
  const [estado, accion] = useActionState(ponerContrasenaTemporalSegura, null)
  const [contrasena, setContrasena] = useState('')
  const campos = estado && !estado.ok ? estado.campos : undefined
  useAvisoDeResultado(estado, null)

  if (estado?.ok) {
    return (
      <ContrasenaParaEntregar
        mensaje={`Contraseña temporal asignada a ${cuenta.nombre}.`}
        contrasena={contrasena}
        alCerrar={alCerrar}
      />
    )
  }

  return (
    <form action={accion} noValidate>
      <p className="hint">
        {cuenta.nombre} ({cuenta.correo}) deberá elegir una contraseña nueva la próxima vez que inicie sesión.
      </p>
      <input type="hidden" name="id" value={cuenta.id} />
      <CampoContrasenaTemporal valor={contrasena} alCambiar={setContrasena} error={campos?.contrasena} />
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={alCerrar}>
          Cancelar
        </button>
        <BotonEnvio>Guardar contraseña</BotonEnvio>
      </div>
    </form>
  )
}
