import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { Icono, type NombreIcono } from '@/components/ui/iconos'
import { listarAusenciasDe } from '@/lib/ausencias/consultas'
import { exigirRol } from '@/lib/auth/sesion'
import { pestanasPersona, type VistaPersona } from '@/lib/comidas/casa'
import { obtenerPlanDe, obtenerSemanaDe } from '@/lib/comidas/consultas'
import { semanaPedida, tipoSemana } from '@/lib/comidas/semana'
import { diaParaMostrar } from '@/lib/comidas/vista'
import type { Voz } from '@/lib/comidas/voz'
import { fechaISOEn, sumarDias } from '@/lib/fechas'
import { listarPerfiles } from '@/lib/perfiles/consultas'
import { ROLES_CON_COMIDAS } from '@/lib/perfiles/roles'
import { PanelAusencias } from '../../../calendario/_componentes/panel-ausencias'
import { NavegacionSemana } from '../../_componentes/navegacion-semana'
import { PlanEditable } from '../../_componentes/plan-editable'
import { RefrescarAlVolver } from '../../_componentes/refrescar-al-volver'
import { SemanaPersona } from '../../_componentes/semana-persona'

const ICONO_VISTA: Record<VistaPersona, NombreIcono> = { semana: 'calendario', plan: 'comidas', ausencias: 'ausencia' }

function vistaPedida(valor: unknown): VistaPersona {
  return valor === 'plan' || valor === 'ausencias' ? valor : 'semana'
}

/**
 * Las comidas de una persona vistas por el Director (La casa): su semana, su plan y sus ausencias,
 * con los mismos controles que usa ella, en tercera persona, y los mismos cierres que todos. Solo
 * personas activas con comidas (Director o Residente); cualquier otra dirección no existe.
 */
export default async function PaginaPersonaDeLaCasa({
  params,
  searchParams,
}: {
  params: Promise<{ persona: string }>
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>
}) {
  const perfil = await exigirRol('director')
  const { persona: id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const personas = await listarPerfiles({ soloActivos: true, roles: ROLES_CON_COMIDAS })
  const persona = personas.find((p) => p.id === id)
  if (!persona) notFound()

  const { semana, ver } = await searchParams
  const vista = vistaPedida(ver)
  const hoy = fechaISOEn(new Date())
  const lunes = semanaPedida(semana, hoy)
  const ruta = `/comidas/casa/${persona.id}`
  // El Director también puede mirarse a sí mismo desde La casa: entonces, en segunda persona.
  const propia = persona.id === perfil.id
  const voz: Voz = propia ? 'propia' : 'ajena'

  return (
    <>
      <RefrescarAlVolver />
      <Link href={`/comidas/casa?semana=${lunes}`} className="btn ghost volver-casa">
        <Icono nombre="izquierda" />
        Volver a La casa
      </Link>
      {/* De quién es lo que sigue, bien a la vista: las pestañas de arriba son las del propio Director. */}
      <div className="persona-cabecera">
        <h2 className="persona-titulo">{propia ? 'Tus comidas' : `Comidas de ${persona.nombre}`}</h2>
        {!propia && (
          <p className="hint">
            Lo que cambies acá es de {persona.nombre}, no tuyo, y va a ver que lo cambió el Director.
          </p>
        )}
        <nav className="sub-tabs" aria-label={propia ? 'Tus comidas' : `Comidas de ${persona.nombre}`}>
          {pestanasPersona(voz).map((v) => {
            const activa = v.clave === vista
            return (
              <Link
                key={v.clave}
                href={`${ruta}?ver=${v.clave}&semana=${lunes}`}
                className={`sub-tab${activa ? ' active' : ''}`}
                aria-current={activa ? 'page' : undefined}
              >
                <Icono nombre={ICONO_VISTA[v.clave]} />
                {v.etiqueta}
              </Link>
            )
          })}
        </nav>
      </div>

      {vista === 'semana' && <VistaSemana ruta={ruta} usuarioId={persona.id} nombre={persona.nombre} voz={voz} lunes={lunes} hoy={hoy} />}
      {vista === 'plan' && <VistaPlan usuarioId={persona.id} nombre={persona.nombre} voz={voz} />}
      {vista === 'ausencias' && (
        <PanelAusencias
          ausencias={await listarAusenciasDe(persona.id, hoy)}
          hoy={hoy}
          persona={propia ? undefined : { id: persona.id, nombre: persona.nombre }}
        />
      )}
    </>
  )
}

async function VistaSemana({
  ruta,
  usuarioId,
  nombre,
  voz,
  lunes,
  hoy,
}: {
  ruta: string
  usuarioId: string
  nombre: string
  voz: Voz
  lunes: string
  hoy: string
}) {
  const dias = await obtenerSemanaDe(usuarioId, lunes)
  const tipo = tipoSemana(lunes, hoy)
  return (
    <>
      <NavegacionSemana lunes={lunes} hoy={hoy} ruta={ruta} />
      {/* key: al cambiar de semana, la burbuja abierta se cierra y la página empieza en el día que corresponde. */}
      <SemanaPersona
        key={lunes}
        dias={dias}
        tipo={tipo}
        diaAlEntrar={tipo === 'actual' ? diaParaMostrar(dias) : null}
        hrefSiguienteSemana={tipo === 'actual' ? `${ruta}?semana=${sumarDias(lunes, 7)}` : null}
        usuarioId={usuarioId}
        voz={voz}
        persona={nombre}
      />
    </>
  )
}

async function VistaPlan({ usuarioId, nombre, voz }: { usuarioId: string; nombre: string; voz: Voz }) {
  const plan = await obtenerPlanDe(usuarioId)
  return (
    <>
      <div className="locked-banner">
        {voz === 'propia'
          ? 'Lo que comés normalmente cada semana. Tocá una comida para cambiarla: los cambios se guardan solos.'
          : `Lo que come normalmente ${nombre} cada semana. Se usa en todas las semanas mientras no se cambie un día puntual. Tocá una comida para cambiarla: los cambios se guardan solos.`}
      </div>
      <PlanEditable plan={plan} usuarioId={usuarioId} voz={voz} persona={nombre} />
    </>
  )
}
