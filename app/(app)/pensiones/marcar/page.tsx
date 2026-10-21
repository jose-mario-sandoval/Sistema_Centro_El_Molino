import { exigirRol } from '@/lib/auth/sesion'
import { mesActual } from '@/lib/pensiones/calculos'
import { obtenerHistorialPropio, obtenerMisPensiones } from '@/lib/pensiones/consultas'
import { obtenerDonaciones } from '@/lib/pensiones/donaciones-consultas'
import { ROLES_PAGO } from '@/lib/pensiones/permisos'
import { esquemaAnioPension } from '@/lib/validacion/pensiones'
import { resumenDonacion, resumenMiPension } from '@/lib/pensiones/resumen-paneles'
import { MarcarPensiones } from '../_componentes/marcar'
import { SelectorPeriodo } from '../_componentes/selector-periodo'
import { Donacion } from '../_componentes/donacion'
import { PanelPensiones } from '../_componentes/panel-pensiones'

export default async function PaginaMarcar({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const perfil = await exigirRol(...ROLES_PAGO)
  const actual = mesActual()
  const seleccionado = esquemaAnioPension.safeParse((await searchParams).anio)
  const anio = seleccionado.success ? seleccionado.data : Number(actual.slice(0, 4))
  const [meses, historial, donaciones] = await Promise.all([
    obtenerMisPensiones(anio), obtenerHistorialPropio(),
    perfil.rol === 'director' ? obtenerDonaciones(anio) : Promise.resolve([]),
  ])
  const periodoResumen = `${anio}-${actual.slice(5, 7)}-01`
  return <>
    <h2 className="section-title">Marcar pensiones</h2>
    {perfil.rol !== 'director' && <p>Registrá los meses que ya pagaste. Al confirmar, el pago queda registrado inmediatamente.</p>}
    <SelectorPeriodo key={anio} ruta="/pensiones/marcar" anio={anio} />
    {perfil.rol === 'director' ? <>
      <PanelPensiones titulo="Mi pensión" descripcion="Consultá y registrá tus pagos"
        resumen={resumenMiPension(meses.find((m) => m.periodo === periodoResumen), periodoResumen)}>
        <p>Registrá los meses que ya pagaste. Al confirmar, el pago queda registrado inmediatamente.</p>
        <MarcarPensiones key={anio} meses={meses} historial={historial} integrado />
      </PanelPensiones>
      <PanelPensiones titulo="Donaciones" descripcion="Registrá la recepción de la donación de la casa"
        resumen={resumenDonacion(donaciones.find((m) => m.periodo === periodoResumen), periodoResumen)}>
        <Donacion key={`donaciones-${anio}`} meses={donaciones} integrado />
      </PanelPensiones>
    </> : <MarcarPensiones key={anio} meses={meses} historial={historial} />}
  </>
}
