import { exigirRol } from '@/lib/auth/sesion'
import { listarReportesPensiones } from '@/lib/pensiones/reportes-consultas'
import { ReportesPensiones } from '../_componentes/reportes-pensiones'

export default async function PaginaReportesPensiones() {
  const perfil = await exigirRol('director', 'administradora')
  const reportes = await listarReportesPensiones()
  return <ReportesPensiones reportes={reportes} puedeSubir={perfil.rol === 'administradora'} />
}
