import { redirect } from 'next/navigation'
import { BotonApariencia } from '@/components/ui/apariencia'
import { obtenerPerfilActual } from '@/lib/auth/sesion'
import { FormularioLogin } from './formulario-login'

export default async function PaginaLogin() {
  // Solo una cuenta activa con sesión sale del login; una desactivada se queda aquí (sin bucle).
  const perfil = await obtenerPerfilActual()
  if (perfil) redirect(perfil.debe_cambiar_contrasena ? '/cambiar-contrasena' : '/comidas/semana')

  return (
    <div id="login-screen">
      {/* Antes de entrar: quien no puede leer la pantalla tampoco puede iniciar sesión. */}
      <div className="login-apariencia">
        <BotonApariencia />
      </div>
      <div className="login-wrap">
        <div className="login-intro">
          <span className="monograma" aria-hidden="true">
            EM
          </span>
          <h1>Centro El Molino</h1>
          <p>Comida, mensajes y calendario, coordinados entre las dos partes de la casa.</p>
        </div>
        <div className="login-card">
          <p className="login-indicacion">Iniciá sesión con tu cuenta para continuar.</p>
          <FormularioLogin />
        </div>
      </div>
    </div>
  )
}
