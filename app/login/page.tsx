import { redirect } from 'next/navigation'
import { obtenerPerfilActual } from '@/lib/auth/sesion'
import { FormularioLogin } from './formulario-login'

export default async function PaginaLogin() {
  // Solo una cuenta activa con sesión sale del login; una desactivada se queda aquí (sin bucle).
  const perfil = await obtenerPerfilActual()
  if (perfil) redirect(perfil.debe_cambiar_contrasena ? '/cambiar-contrasena' : '/comidas/semana')

  return (
    <div id="login-screen">
      <div className="login-wrap">
        <div className="login-intro">
          <div className="eyebrow">Sistema interno</div>
          <h1>Centro El Molino</h1>
          <p>Comida, mensajes y calendario, coordinados entre las dos partes de la casa.</p>
          <p>Iniciá sesión con tu cuenta para continuar.</p>
        </div>
        <div>
          <div className="login-card">
            <FormularioLogin />
          </div>
        </div>
      </div>
    </div>
  )
}
