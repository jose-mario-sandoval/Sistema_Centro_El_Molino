'use client'

import { generarContrasenaTemporal } from '@/lib/cuentas/contrasena-temporal'

export function CampoContrasenaTemporal({
  valor,
  alCambiar,
  error,
}: {
  valor: string
  alCambiar: (valor: string) => void
  error?: string
}) {
  return (
    <div className="field">
      <label htmlFor="contrasena-temporal">Contraseña temporal</label>
      <div className="contrasena-generada">
        <input
          id="contrasena-temporal"
          name="contrasena"
          type="text"
          autoComplete="off"
          spellCheck={false}
          minLength={8}
          required
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
        />
        <button type="button" className="btn ghost" onClick={() => alCambiar(generarContrasenaTemporal())}>
          Generar
        </button>
      </div>
      <div className="hint">Escribila o generala. Al iniciar sesión, la persona deberá elegir una nueva.</div>
      {error && <div className="campo-error">{error}</div>}
    </div>
  )
}

/** Paso final de los modales: muestra la contraseña para entregarla en persona. */
export function ContrasenaParaEntregar({
  mensaje,
  contrasena,
  alCerrar,
}: {
  mensaje: string
  contrasena: string
  alCerrar: () => void
}) {
  return (
    <>
      <p role="status">{mensaje}</p>
      <div className="clave-temporal">{contrasena}</div>
      <p className="hint">
        Entregala en persona; no se vuelve a mostrar. La app no envía correos: al iniciar sesión se pedirá elegir una
        contraseña nueva.
      </p>
      <div className="modal-foot">
        <button type="button" className="btn" onClick={alCerrar}>
          Listo
        </button>
      </div>
    </>
  )
}
