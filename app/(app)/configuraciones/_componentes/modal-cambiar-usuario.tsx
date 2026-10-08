'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { Modal } from '@/components/ui/modal'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { cambiarUsuarioCuenta } from '../acciones'
import { accionDeFormulario } from './llamar-accion'
import { useAvisoDeResultado } from './usar-aviso-resultado'

const cambiarUsuarioCuentaSegura = accionDeFormulario(cambiarUsuarioCuenta)

export function ModalCambiarUsuario({ cuenta, alCerrar }: { cuenta: Cuenta | null; alCerrar: () => void }) {
  // Montado solo mientras está abierto (y uno por cuenta): cada apertura empieza con el usuario vigente.
  return cuenta ? <FormularioCambiarUsuario key={cuenta.id} cuenta={cuenta} alCerrar={alCerrar} /> : null
}

function FormularioCambiarUsuario({ cuenta, alCerrar }: { cuenta: Cuenta; alCerrar: () => void }) {
  const [estado, accion, pendiente] = useActionState(cambiarUsuarioCuentaSegura, null)
  const [usuario, setUsuario] = useState(cuenta.usuario)
  const campos = estado && !estado.ok ? estado.campos : undefined
  const listo = useRef<HTMLButtonElement>(null)
  useAvisoDeResultado(estado, null)

  // El formulario (y el botón que tenía el foco) desaparece al guardar: el foco pasa a "Listo".
  const guardado = estado?.ok === true
  useEffect(() => {
    if (guardado) listo.current?.focus()
  }, [guardado])

  return (
    <Modal titulo="Cambiar usuario" abierto alCerrar={alCerrar} bloquearCierre={pendiente}>
      {estado?.ok ? (
        <>
          <p role="status">
            {cuenta.nombre} ahora entra con el usuario <strong>{estado.data.usuario}</strong>.
          </p>
          <p className="hint">Avisale: el usuario anterior ya no sirve. La contraseña no cambió.</p>
          <div className="modal-foot">
            <button ref={listo} type="button" className="btn" onClick={alCerrar}>
              Listo
            </button>
          </div>
        </>
      ) : (
        <form action={accion} noValidate>
          <input type="hidden" name="id" value={cuenta.id} />
          <div className="field">
            <label htmlFor="cambiar-usuario">Usuario de {cuenta.nombre}</label>
            <input
              id="cambiar-usuario"
              name="usuario"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
            <div className="hint">Letras sin tilde, números, punto o guion. Ejemplo: r.flores</div>
            {campos?.usuario && <div className="campo-error">{campos.usuario}</div>}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={alCerrar} disabled={pendiente}>
              Cancelar
            </button>
            <BotonEnvio textoPendiente="Guardando…">Guardar usuario</BotonEnvio>
          </div>
        </form>
      )}
    </Modal>
  )
}
