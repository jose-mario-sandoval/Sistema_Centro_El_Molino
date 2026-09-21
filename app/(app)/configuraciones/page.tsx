import { BotonCerrarSesion } from '@/components/app/cerrar-sesion'
import { exigirPerfil } from '@/lib/auth/sesion'
import { listarCuentas, obtenerHorasLimite } from '@/lib/configuraciones/consultas'
import { ROLES_CON_COMIDAS } from '@/lib/perfiles/roles'
import { SeccionApariencia } from './_componentes/seccion-apariencia'
import { SeccionGestionUsuarios } from './_componentes/seccion-gestion-usuarios'
import { SeccionHorasLimite } from './_componentes/seccion-horas-limite'
import { SeccionMiCuenta } from './_componentes/seccion-mi-cuenta'
import { SeccionNotificaciones } from './_componentes/seccion-notificaciones'

export default async function PaginaConfiguraciones() {
  const perfil = await exigirPerfil()
  const esDirector = perfil.rol === 'director'
  const [horas, cuentas] = esDirector ? await Promise.all([obtenerHorasLimite(), listarCuentas()]) : [null, null]

  return (
    <>
      <div className="page-head">
        <h1>Ajustes</h1>
        <div className="desc">Cómo se ve la aplicación, tu cuenta y los avisos.</div>
      </div>

      {/* 0. Apariencia (todos los roles): primero, porque sin ella alguien puede no leer el resto. */}
      <SeccionApariencia />

      {/* 1. Mi cuenta (todos los roles) */}
      <SeccionMiCuenta perfil={perfil} />

      {/* 2. Notificaciones (todos los roles; pista 06) */}
      <SeccionNotificaciones
        avisarHoraLimite={perfil.avisar_hora_limite}
        avisarMensajes={perfil.avisar_mensajes}
        conComidas={ROLES_CON_COMIDAS.includes(perfil.rol)}
      />

      {/* 3. Horas límite (solo Director) */}
      {esDirector && horas && <SeccionHorasLimite horas={horas} />}

      {/* 4. Gestión de usuarios (solo Director) */}
      {esDirector && cuentas && <SeccionGestionUsuarios cuentas={cuentas} idPropio={perfil.id} />}

      {/* En el teléfono no hay lateral: la salida vive acá. En escritorio se oculta (ya está en el lateral). */}
      <section className="settings-section solo-telefono" aria-label="Sesión">
        <BotonCerrarSesion />
      </section>
    </>
  )
}
