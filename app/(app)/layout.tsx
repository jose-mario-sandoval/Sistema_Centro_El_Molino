import { BotonCerrarSesion } from '@/components/app/cerrar-sesion'
import { NavegacionLateral, NavegacionMovil } from '@/components/app/navegacion'
import { exigirPerfil } from '@/lib/auth/sesion'
import { ETIQUETA_ROL } from '@/lib/perfiles/roles'

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil()

  return (
    <div id="app-screen">
      <aside className="sidebar">
        <div className="brand">
          <div className="name">El Molino</div>
          <div className="sub">Sistema interno</div>
        </div>
        <NavegacionLateral />
        <div className="sidebar-foot">
          <div className="who-box">
            <div className="avatar">{perfil.siglas}</div>
            <div className="who">
              <div className="name">{perfil.nombre}</div>
              <div className="role">{ETIQUETA_ROL[perfil.rol]}</div>
            </div>
          </div>
          <div className="sidebar-actions">
            <BotonCerrarSesion />
          </div>
        </div>
      </aside>
      <div className="main">
        <div className="topbar">
          <div className="brand">
            <span className="name" style={{ fontSize: 16 }}>El Molino</span>
          </div>
          <NavegacionMovil />
          <BotonCerrarSesion />
        </div>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
