import { exigirRol } from '@/lib/auth/sesion'
import { ROLES_PENSIONES } from '@/lib/pensiones/permisos'
import { PestanasPensiones } from './_componentes/pestanas'
import { RefrescarPensiones } from './_componentes/refrescar'

export default async function LayoutPensiones({ children }: { children: React.ReactNode }) {
  const perfil = await exigirRol(...ROLES_PENSIONES)
  return <>
    <div className="page-head"><h1>Pensiones</h1><p className="desc">Cuotas mensuales, pagos registrados y reportes de la casa.</p></div>
    <PestanasPensiones rol={perfil.rol} />
    <RefrescarPensiones />
    <div className="pensiones">{children}</div>
  </>
}
