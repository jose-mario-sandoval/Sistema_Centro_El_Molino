import { exigirPerfil } from '@/lib/auth/sesion'
import { obtenerNotaDietaDe, obtenerPlanDe, obtenerResumenPlanSemanal } from '@/lib/comidas/consultas'
import { PlanAgregadoAdministracion } from '../_componentes/plan-agregado-administracion'
import { PlanEditable } from '../_componentes/plan-editable'
import { NotasDieta } from '../_componentes/notas-dieta'

export default async function PaginaPlanSemanal() {
  const perfil = await exigirPerfil()

  if (perfil.rol === 'administracion') {
    const resumenSemana = await obtenerResumenPlanSemanal()
    return <PlanAgregadoAdministracion resumenSemana={resumenSemana} />
  }

  const [plan, notaDieta] = await Promise.all([obtenerPlanDe(perfil.id), obtenerNotaDietaDe(perfil.id)])
  return (
    <>
      <div className="locked-banner">
        Lo que comés normalmente cada semana. Se usa en todas las semanas mientras no cambies un día puntual. Tocá una
        comida para cambiarla: los cambios se guardan solos.
      </div>
      <PlanEditable plan={plan} />
      <NotasDieta notaInicial={notaDieta} />
    </>
  )
}
