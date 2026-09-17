import type { Perfil } from '@/lib/auth/sesion'
import { FormularioMiContrasena } from './formulario-mi-contrasena'
import { FormularioMiCuenta } from './formulario-mi-cuenta'

export function SeccionMiCuenta({ perfil }: { perfil: Perfil }) {
  return (
    <section className="settings-section" aria-labelledby="titulo-mi-cuenta">
      <h2 id="titulo-mi-cuenta">Mi cuenta</h2>
      <div className="desc">Editá tu información personal.</div>
      <FormularioMiCuenta nombre={perfil.nombre} siglas={perfil.siglas} correo={perfil.correo} rol={perfil.rol} />
      <h3 className="subtitulo-seccion">Cambiar contraseña</h3>
      <FormularioMiContrasena />
    </section>
  )
}
