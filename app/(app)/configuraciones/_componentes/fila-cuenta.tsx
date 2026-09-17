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
}: {
  cuenta: Cuenta
  esPropia: boolean
  alPonerContrasena: () => void
  alDesactivar: () => void
}) {
  const aviso = useAviso()
  const [rol, setRolOptimista] = useOptimistic(cuenta.rol)
  const [pendiente, iniciarTransicion] = useTransition()

  function cambiarRol(nuevo: Rol) {
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
      <td>
        {cuenta.nombre} <span className="role-pill">{cuenta.siglas}</span>
        {esPropia && <div className="hint">Tu cuenta</div>}
      </td>
      <td>{cuenta.correo}</td>
      <td>
        <select
          aria-label={`Rol de ${cuenta.nombre}`}
          value={rol}
          disabled={esPropia || pendiente}
          onChange={(e) => cambiarRol(e.target.value as Rol)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ETIQUETA_ROL[r]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className="role-pill">{cuenta.activo ? 'Activa' : 'Desactivada'}</span>
        {cuenta.debe_cambiar_contrasena && <div className="hint">Cambio de contraseña pendiente</div>}
      </td>
      <td>
        {!esPropia && (
          <div className="acciones-cuenta">
            <button type="button" className="btn ghost small" onClick={alPonerContrasena} disabled={pendiente}>
              Contraseña temporal
            </button>
            {cuenta.activo ? (
              <button type="button" className="btn ghost small" onClick={alDesactivar} disabled={pendiente}>
                Desactivar
              </button>
            ) : (
              <button type="button" className="btn small" onClick={reactivar} disabled={pendiente}>
                Reactivar
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}
