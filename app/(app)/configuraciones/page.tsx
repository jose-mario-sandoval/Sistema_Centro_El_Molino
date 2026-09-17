import { exigirPerfil } from '@/lib/auth/sesion'
import { listarCuentas, obtenerHorasLimite } from '@/lib/configuraciones/consultas'
import { SeccionGestionUsuarios } from './_componentes/seccion-gestion-usuarios'
import { SeccionHorasLimite } from './_componentes/seccion-horas-limite'
import { SeccionMiCuenta } from './_componentes/seccion-mi-cuenta'

export default async function PaginaConfiguraciones() {
  const perfil = await exigirPerfil()
  const esDirector = perfil.rol === 'director'
  const [horas, cuentas] = esDirector ? await Promise.all([obtenerHorasLimite(), listarCuentas()]) : [null, null]

  return (
    <>
      <div className="page-head">
        <h1>Configuraciones</h1>
        <div className="desc">Información de tu cuenta y opciones del sistema.</div>
      </div>

      {/* 1. Mi cuenta (todos los roles) */}
      <SeccionMiCuenta perfil={perfil} />

      {/* CONTRATO pista 06-B (índice §4): insertar aquí <SeccionNotificaciones />, después de "Mi cuenta" y antes de las secciones del Director. */}

      {/* 2. Horas límite (solo Director) */}
      {esDirector && horas && <SeccionHorasLimite horas={horas} />}

      {/* 3. Gestión de usuarios (solo Director) */}
      {esDirector && cuentas && <SeccionGestionUsuarios cuentas={cuentas} idPropio={perfil.id} />}
    </>
  )
}
