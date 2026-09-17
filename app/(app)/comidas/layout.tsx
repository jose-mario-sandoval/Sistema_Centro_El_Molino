import { exigirPerfil } from '@/lib/auth/sesion'
import { PestanasComidas } from './_componentes/pestanas'

export default async function LayoutComidas({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil()
  const esAdministracion = perfil.rol === 'administracion'

  return (
    <>
      <div className="page-head">
        <h1>Comidas</h1>
        <div className="desc">
          {esAdministracion
            ? 'Planes y selecciones de comida de la casa, en solo lectura.'
            : 'Tu plan habitual y lo que vas a comer cada día de la semana.'}
        </div>
      </div>
      <PestanasComidas />
      {children}
    </>
  )
}
