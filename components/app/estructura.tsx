import { BotonCerrarSesion } from '@/components/app/cerrar-sesion'
import { NavegacionInferior, NavegacionLateral } from '@/components/app/navegacion'
import { BotonApariencia } from '@/components/ui/apariencia'

/**
 * Estructura de la app: lateral en escritorio; barra superior y barra inferior en el teléfono
 * (DESIGN.md §8). Solo presentación: la sesión la resuelve el layout que la usa.
 */
export function Estructura({
  nombre,
  siglas,
  rol,
  children,
}: {
  nombre: string
  siglas: string
  rol: string
  children: React.ReactNode
}) {
  return (
    <div id="app-screen">
      <aside className="sidebar">
        <div className="brand">
          <span className="monograma" aria-hidden="true">
            EM
          </span>
          <div>
            <div className="name">El Molino</div>
            <div className="sub">Sistema interno</div>
          </div>
        </div>
        <NavegacionLateral />
        <div className="sidebar-foot">
          <div className="who-box">
            <div className="avatar">{siglas}</div>
            <div className="who">
              <div className="name">{nombre}</div>
              <div className="role">{rol}</div>
            </div>
          </div>
          <div className="sidebar-actions">
            <BotonApariencia conTexto hacia="arriba" guardarEnCuenta />
            <BotonCerrarSesion />
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <span className="monograma" aria-hidden="true">
            EM
          </span>
          <span className="name">El Molino</span>
          <div className="topbar-acciones">
            <BotonApariencia guardarEnCuenta />
            <div className="avatar" title={nombre}>
              {siglas}
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
      <NavegacionInferior />
    </div>
  )
}
