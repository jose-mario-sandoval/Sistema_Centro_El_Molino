import { exigirPerfil } from '@/lib/auth/sesion'
import { DescripcionComidas } from './_componentes/descripcion-comidas'
import { PestanasComidas } from './_componentes/pestanas'

export default async function LayoutComidas({ children }: { children: React.ReactNode }) {
  const perfil = await exigirPerfil()

  return (
    <>
      <div className="page-head">
        <h1>Comidas</h1>
        <DescripcionComidas rol={perfil.rol} />
      </div>
      <PestanasComidas esDirector={perfil.rol === 'director'} />
      {children}
    </>
  )
}
