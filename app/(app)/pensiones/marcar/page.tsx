import { exigirRol } from '@/lib/auth/sesion'
import { mesActual } from '@/lib/pensiones/calculos'
import { obtenerHistorialPropio, obtenerMisPensiones } from '@/lib/pensiones/consultas'
import { ROLES_PAGO } from '@/lib/pensiones/permisos'
import { esquemaAnioPension } from '@/lib/validacion/pensiones'
import { MarcarPensiones } from '../_componentes/marcar'
import { SelectorPeriodo } from '../_componentes/selector-periodo'

export default async function PaginaMarcar({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  await exigirRol(...ROLES_PAGO)
  const actual = mesActual()
  const seleccionado = esquemaAnioPension.safeParse((await searchParams).anio)
  const anio = seleccionado.success ? seleccionado.data : Number(actual.slice(0, 4))
  const [meses, historial] = await Promise.all([obtenerMisPensiones(anio), obtenerHistorialPropio()])
  return <>
    <h2 className="section-title">Marcar pensiones</h2>
    <p>Registrá los meses que ya pagaste. Al confirmar, el pago queda registrado inmediatamente.</p>
    <SelectorPeriodo key={anio} ruta="/pensiones/marcar" anio={anio} />
    <MarcarPensiones key={anio} meses={meses} historial={historial} />
  </>
}
