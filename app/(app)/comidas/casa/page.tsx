import { redirect } from 'next/navigation'
import { z } from 'zod'
import { exigirRol } from '@/lib/auth/sesion'
import { diasParaExtra } from '@/lib/comidas/casa'
import { obtenerExtrasDeLaSemana, obtenerNotasExtras, obtenerSemanaDeLaCasa } from '@/lib/comidas/consultas'
import { semanaPedida } from '@/lib/comidas/semana'
import { fechaISOEn } from '@/lib/fechas'
import { NavegacionSemana } from '../_componentes/navegacion-semana'
import { RefrescarAlVolver } from '../_componentes/refrescar-al-volver'
import { ExtrasCasa } from './_componentes/extras-casa'
import { TablaCasa } from './_componentes/tabla-casa'

const esUuid = (valor: unknown): valor is string => z.uuid().safeParse(valor).success

/**
 * "La casa" (solo el Director): la semana de toda la casa con los nombres, para ver quién come y
 * cambiar la comida de cualquier persona con los mismos cierres que todos, y los extras para la cocina.
 */
export default async function PaginaLaCasa({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>
}) {
  const perfil = await exigirRol('director')
  const { semana, persona } = await searchParams

  const hoy = fechaISOEn(new Date())
  const lunes = semanaPedida(semana, hoy)

  // "Ver la semana de:" es un formulario GET (funciona sin JavaScript): acá se lo lleva a su página.
  if (esUuid(persona)) redirect(`/comidas/casa/${persona}?semana=${lunes}`)

  const [dias, extras, extrasManuales] = await Promise.all([
    obtenerSemanaDeLaCasa(lunes),
    obtenerExtrasDeLaSemana(lunes),
    obtenerNotasExtras(lunes),
  ])
  const personas = dias[0]?.comidas[0]?.personas.map(({ id, nombre }) => ({ id, nombre })) ?? []
  // Un extra se quita solo mientras su comida no cerró (hora límite o job de cierre).
  const cerradas = dias.flatMap((dia) =>
    dia.comidas.filter((comida) => !comida.sinCerrar).map((comida) => `${dia.fecha}|${comida.comida}`),
  )

  return (
    <>
      {/* Al volver a la pestaña, trae cierres y cambios hechos mientras tanto. */}
      <RefrescarAlVolver />
      <NavegacionSemana lunes={lunes} hoy={hoy} ruta="/comidas/casa" />

      <form action="/comidas/casa" method="get" className="card ver-persona">
        <input type="hidden" name="semana" value={lunes} />
        <div className="field">
          <label htmlFor="ver-persona">Ver la semana de:</label>
          <div className="ver-persona-fila">
            <select id="ver-persona" name="persona" required defaultValue="">
              <option value="" disabled>
                Elegí una persona
              </option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === perfil.id ? `${p.nombre} (vos)` : p.nombre}
                </option>
              ))}
            </select>
            <button type="submit" className="btn">
              Ver
            </button>
          </div>
        </div>
        <p className="hint">Su semana, su plan de comida y sus ausencias, para verlos o cambiarlos.</p>
      </form>

      {/* key: al cambiar de semana, la celda abierta se cierra. */}
      <TablaCasa key={lunes} lunes={lunes} dias={dias} extras={extras} yo={perfil.id} />

      <ExtrasCasa key={`extras-${lunes}`} extras={extrasManuales} dias={diasParaExtra(lunes, hoy)} cerradas={cerradas} />
    </>
  )
}
