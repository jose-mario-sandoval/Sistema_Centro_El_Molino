import Link from 'next/link'
import { exigirRol } from '@/lib/auth/sesion'
import { mesActual } from '@/lib/pensiones/calculos'
import { obtenerHistorialDe, obtenerPensionesDe, obtenerPersonasPensionesCasa } from '@/lib/pensiones/consultas'
import { ETIQUETA_ROL } from '@/lib/perfiles/roles'
import { esquemaAnioPension } from '@/lib/validacion/pensiones'
import { MarcarPensiones } from '../_componentes/marcar'

export default async function PaginaPensionesCasa({ searchParams }: {
  searchParams: Promise<{ persona?: string; anio?: string }>
}) {
  const perfil = await exigirRol('director')
  const parametros = await searchParams
  const seleccionado = esquemaAnioPension.safeParse(parametros.anio)
  const anio = seleccionado.success ? seleccionado.data : Number(mesActual().slice(0, 4))
  const personas = (await obtenerPersonasPensionesCasa()).filter((p) => p.id !== perfil.id)
  // La selección solo admite personas de la lista activa autorizada; nunca se consulta un ID arbitrario.
  const persona = personas.find((p) => p.id === parametros.persona)
  const [meses, historial] = persona
    ? await Promise.all([obtenerPensionesDe(persona.id, anio), obtenerHistorialDe(persona.id)])
    : [[], []]

  return <>
    <h2 className="section-title">Pensiones de la casa</h2>
    <p>Consultá y registrá los pagos de residentes y otros directores. Tu pensión continúa en <Link href="/pensiones/marcar">Marcar pensiones</Link>.</p>
    {personas.length ? <form action="/pensiones/casa" method="get" className="card pensiones-selector" aria-label="Elegir persona y año">
      <div className="field">
        <label htmlFor="pension-persona">Persona</label>
        <select id="pension-persona" name="persona" required defaultValue={persona?.id ?? ''}>
          <option value="" disabled>Elegí una persona</option>
          {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {ETIQUETA_ROL[p.rol]}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="pension-anio">Año</label>
        <input id="pension-anio" name="anio" type="number" min="2000" max="2200" required defaultValue={anio} />
      </div>
      <button className="btn" type="submit">Consultar</button>
    </form> : <p className="empty-state">No hay residentes ni otros directores activos.</p>}
    {parametros.persona && !persona && <p role="status">Elegí una cuenta activa de Residente u otro Director del listado.</p>}
    {persona && <>
      <h3 className="section-title">Pensión de {persona.nombre}</h3>
      <p>{ETIQUETA_ROL[persona.rol]} · Períodos de {anio}. Los importes corresponden a esta persona.</p>
      <MarcarPensiones key={`${persona.id}-${anio}`} meses={meses} historial={historial} persona={{ id: persona.id, nombre: persona.nombre }} />
    </>}
  </>
}
