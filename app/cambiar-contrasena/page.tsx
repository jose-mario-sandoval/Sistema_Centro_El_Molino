import { redirect } from 'next/navigation'
import { obtenerPerfilActual } from '@/lib/auth/sesion'
import { FormularioCambioContrasena } from './formulario'

export default async function PaginaCambiarContrasena() {
  const perfil = await obtenerPerfilActual()
  if (!perfil) redirect('/login')
  if (!perfil.debe_cambiar_contrasena) redirect('/comidas/semana')

  return (
    <div id="login-screen">
      <div className="login-wrap">
        <div className="login-intro">
          <div className="eyebrow">Contraseña temporal</div>
          <h1>Elegí tu contraseña</h1>
          <p>Hola, {perfil.nombre}. Tu contraseña fue asignada por el Director; elegí una nueva para continuar.</p>
        </div>
        <div>
          <div className="login-card">
            <FormularioCambioContrasena />
          </div>
        </div>
      </div>
    </div>
  )
}
