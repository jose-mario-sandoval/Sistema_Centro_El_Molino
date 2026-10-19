import { exigirRol } from '@/lib/auth/sesion'
import { mesActual } from '@/lib/pensiones/calculos'
import { obtenerConfiguraciones } from '@/lib/pensiones/consultas'
import { EditarCuota } from '../_componentes/editar-cuota'

export default async function PaginaEditarPensiones() {
  await exigirRol('director')
  const personas = await obtenerConfiguraciones()
  const actual = mesActual()
  return <>
    <h2 className="section-title">Editar cuotas personales</h2>
    <p>Elegí la categoría y el monto de cada persona. La categoría es independiente de su rol y no fija un precio común.</p>
    <p>Los cambios se aplican desde el mes que elijás, a partir del mes actual. Los pagos ya registrados conservan su monto y categoría.</p>
    {personas.length ? personas.map((p) => <EditarCuota key={p.id} persona={p} actual={actual} />) : <p className="empty-state">No hay personas para configurar.</p>}
  </>
}
