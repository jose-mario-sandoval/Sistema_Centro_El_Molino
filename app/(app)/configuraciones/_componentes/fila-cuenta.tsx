'use client'

import { useOptimistic, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { ETIQUETA_ROL, ROLES, type Rol } from '@/lib/perfiles/roles'
import { cambiarEstadoCuenta, cambiarRolCuenta } from '../acciones'
import { llamarAccion } from './llamar-accion'

export function FilaCuenta({
  cuenta,
  esPropia,
  alPonerContrasena,
  alDesactivar,
  alConfirmarRol,
}: {
  cuenta: Cuenta
  esPropia: boolean
  alPonerContrasena: () => void
  alDesactivar: () => void
  /** Dar o quitar el rol Director pasa por una confirmación; el resto de los cambios de rol se aplica directo. */
  alConfirmarRol: (rol: Rol) => void
}) {
  const aviso = useAviso()
  const [rol, setRolOptimista] = useOptimistic(cuenta.rol)
  const [pendiente, iniciarTransicion] = useTransition()

  // Mientras corre una acción de la fila se ignoran clics y cambios, pero sin `disabled`:
  // un control deshabilitado pierde el foco y quien usa el teclado vuelve al principio de la página.
  function siLibre(accion: () => void) {
    return () => {
      if (!pendiente) accion()
    }
  }

  function cambiarRol(nuevo: Rol) {
    if (pendiente || nuevo === rol) return
    if (nuevo === 'director' || rol === 'director') {
      // El select es controlado: sigue mostrando el rol vigente hasta que se confirme.
      alConfirmarRol(nuevo)
      return
    }
    iniciarTransicion(async () => {
      setRolOptimista(nuevo)
      const resultado = await llamarAccion(() => cambiarRolCuenta({ id: cuenta.id, rol: nuevo }))
      aviso(resultado.ok ? `Rol actualizado para ${cuenta.nombre}.` : resultado.error)
    })
  }

  function reactivar() {
    iniciarTransicion(async () => {
      const resultado = await llamarAccion(() => cambiarEstadoCuenta({ id: cuenta.id, activo: true }))
      aviso(resultado.ok ? `Cuenta reactivada: ${cuenta.nombre}.` : resultado.error)
    })
  }

  return (
    <tr className={cuenta.activo ? undefined : 'inactiva'}>
      <td data-et="Nombre">
        {cuenta.nombre} <span className="role-pill">{cuenta.siglas}</span>
        {esPropia && <div className="hint">Tu cuenta</div>}
      </td>
      <td data-et="Correo">{cuenta.correo}</td>
      <td data-et="Rol">
        <select
          aria-label={`Rol de ${cuenta.nombre}`}
          aria-busy={pendiente}
          value={rol}
          disabled={esPropia}
          onChange={(e) => cambiarRol(e.target.value as Rol)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ETIQUETA_ROL[r]}
            </option>
          ))}
        </select>
      </td>
      <td data-et="Estado">
        <span className="role-pill">{cuenta.activo ? 'Activa' : 'Desactivada'}</span>
        {cuenta.debe_cambiar_contrasena && <div className="hint">Cambio de contraseña pendiente</div>}
      </td>
      <td className="acciones-celda">
        {!esPropia && (
          <div className="acciones-cuenta">
            <button
              type="button"
              className="btn ghost small"
              aria-label={`Contraseña temporal de ${cuenta.nombre}`}
              aria-busy={pendiente}
              onClick={siLibre(alPonerContrasena)}
            >
              Contraseña temporal
            </button>
            {cuenta.activo ? (
              <button
                type="button"
                className="btn ghost small"
                aria-label={`Desactivar a ${cuenta.nombre}`}
                aria-busy={pendiente}
                onClick={siLibre(alDesactivar)}
              >
                Desactivar
              </button>
            ) : (
              <button
                type="button"
                className="btn small"
                aria-label={`Reactivar a ${cuenta.nombre}`}
                aria-busy={pendiente}
                onClick={siLibre(reactivar)}
              >
                Reactivar
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}
