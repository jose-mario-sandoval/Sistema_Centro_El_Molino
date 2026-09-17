'use client'

import { useEffect, useRef } from 'react'
import { useAviso } from '@/components/ui/avisos'
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

/**
 * Paso final de los modales: muestra la contraseña para entregarla en persona.
 * El modal que lo contiene bloquea Escape y el fondo: solo "Listo" lo cierra, para no perderla sin querer.
 */
export function ContrasenaParaEntregar({
  mensaje,
  contrasena,
  alCerrar,
}: {
  mensaje: string
  contrasena: string
  alCerrar: () => void
}) {
  const aviso = useAviso()
  const listo = useRef<HTMLButtonElement>(null)

  // El formulario (y el botón que tenía el foco) desaparece al llegar a este paso: el foco pasa a "Listo".
  useEffect(() => {
    listo.current?.focus()
  }, [])

  async function copiar() {
    try {
      // `navigator.clipboard` no existe fuera de un contexto seguro (https o localhost).
      if (!navigator.clipboard) throw new Error('Portapapeles no disponible')
      await navigator.clipboard.writeText(contrasena)
      aviso('Contraseña copiada.')
    } catch {
      aviso('No se pudo copiar. Seleccioná la contraseña y copiala a mano.')
    }
  }

  return (
    <>
      <p role="status">{mensaje}</p>
      <div className="clave-temporal">{contrasena}</div>
      <p className="hint">
        Entregala en persona; no se vuelve a mostrar. La app no envía correos: al iniciar sesión se pedirá elegir una
        contraseña nueva.
      </p>
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={copiar}>
          Copiar
        </button>
        <button ref={listo} type="button" className="btn" onClick={alCerrar}>
          Listo
        </button>
      </div>
    </>
  )
}
