import { exigirPerfil } from '@/lib/auth/sesion'
import { obtenerPlanPropio, obtenerResumenPlanSemanal } from '@/lib/comidas/consultas'
import { PlanAgregadoAdministracion } from '../_componentes/plan-agregado-administracion'
import { PlanEditable } from '../_componentes/plan-editable'

export default async function PaginaPlanSemanal() {
  const perfil = await exigirPerfil()

  if (perfil.rol === 'administracion') {
    const resumenSemana = await obtenerResumenPlanSemanal()
    return <PlanAgregadoAdministracion resumenSemana={resumenSemana} />
  }

  const plan = await obtenerPlanPropio(perfil.id)
  return (
    <>
      <div className="locked-banner">
        Este es tu patrón habitual de comidas: se usa en cada semana mientras no cambies un día puntual. Los cambios se
        guardan solos.
      </div>
      <PlanEditable plan={plan} />
    </>
  )
}
