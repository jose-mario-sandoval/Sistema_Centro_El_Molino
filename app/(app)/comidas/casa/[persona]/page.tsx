import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { Icono } from '@/components/ui/iconos'
import { listarAusenciasDe } from '@/lib/ausencias/consultas'
import { exigirRol } from '@/lib/auth/sesion'
import { obtenerPlanDe, obtenerSemanaDe } from '@/lib/comidas/consultas'
import { semanaPedida, tipoSemana } from '@/lib/comidas/semana'
import { diaParaAbrir } from '@/lib/comidas/vista'
import type { Voz } from '@/lib/comidas/voz'
import { fechaISOEn, sumarDias } from '@/lib/fechas'
import { listarPerfiles } from '@/lib/perfiles/consultas'
import { ROLES_CON_COMIDAS } from '@/lib/perfiles/roles'
import { PanelAusencias } from '../../../calendario/_componentes/panel-ausencias'
import { NavegacionSemana } from '../../_componentes/navegacion-semana'
import { PlanEditable } from '../../_componentes/plan-editable'
import { RefrescarAlVolver } from '../../_componentes/refrescar-al-volver'
import { SemanaPersona } from '../../_componentes/semana-persona'

const VISTAS = [
  { clave: 'semana', etiqueta: 'Semana' },
  { clave: 'plan', etiqueta: 'Plan de comida' },
  { clave: 'ausencias', etiqueta: 'Ausencias' },
] as const
type Vista = (typeof VISTAS)[number]['clave']

function vistaPedida(valor: unknown): Vista {
  return VISTAS.find((v) => v.clave === valor)?.clave ?? 'semana'
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
      <h2 className="persona-titulo">{propia ? `${persona.nombre} (vos)` : persona.nombre}</h2>
      <nav className="tabs sub-tabs" aria-label={`Comidas de ${persona.nombre}`}>
        {VISTAS.map((v) => {
          const activa = v.clave === vista
          return (
            <Link
              key={v.clave}
              href={`${ruta}?ver=${v.clave}&semana=${lunes}`}
              className={`tab-btn${activa ? ' active' : ''}`}
              aria-current={activa ? 'page' : undefined}
            >
              {v.etiqueta}
            </Link>
          )
        })}
      </nav>

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
      {/* key: al cambiar de semana, la tarjeta abierta vuelve a empezar desde el día que corresponde. */}
      <SemanaPersona
        key={lunes}
        dias={dias}
        tipo={tipo}
        diaInicial={tipo === 'actual' ? diaParaAbrir(dias) : null}
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
