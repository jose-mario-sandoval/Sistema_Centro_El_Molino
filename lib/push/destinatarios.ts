import { ROLES_CON_COMIDAS, type Rol } from '@/lib/perfiles/roles'
import { veSoloSiglas } from '@/lib/perfiles/visibilidad'

/** Datos del perfil que deciden si una persona recibe un aviso (columnas de `perfiles`). */
export type PerfilAviso = {
  id: string
  rol: Rol
  activo: boolean
  avisar_mensajes: boolean
  avisar_hora_limite: boolean
  avisar_cambios: boolean
  avisar_cocina: boolean
}

type Preferencia = 'avisar_mensajes' | 'avisar_hora_limite' | 'avisar_cambios' | 'avisar_cocina'

/** Ids de `candidatos` activos y con la preferencia, en el orden de `perfiles`, sin `excluir`. */
function filtrar(perfiles: PerfilAviso[], candidatos: Set<string>, preferencia: Preferencia, excluir?: string): string[] {
  return perfiles
    .filter((p) => candidatos.has(p.id) && p.id !== excluir && p.activo && p[preferencia])
    .map((p) => p.id)
}

/** Ids de los perfiles con alguno de `roles`. */
function conRol(perfiles: PerfilAviso[], roles: readonly Rol[]): Set<string> {
  return new Set(perfiles.filter((p) => roles.includes(p.rol)).map((p) => p.id))
}

/** Nueva publicación: todos menos el autor (spec §8.2). */
export function destinatariosPublicacion(p: { autorId: string; perfiles: PerfilAviso[] }): string[] {
  const todos = new Set(p.perfiles.map((perfil) => perfil.id))
  return filtrar(p.perfiles, todos, 'avisar_mensajes', p.autorId)
}

/** Nueva respuesta: autor de la publicación y quienes ya respondieron, menos quien responde (spec §8.2). */
export function destinatariosRespuesta(p: {
  autorPublicacionId: string
  autoresRespuestas: string[]
  quienRespondeId: string
  perfiles: PerfilAviso[]
}): string[] {
  const hilo = new Set([p.autorPublicacionId, ...p.autoresRespuestas])
  return filtrar(p.perfiles, hilo, 'avisar_mensajes', p.quienRespondeId)
}

/** Recordatorio de hora límite: `sinDefinir` viene de `comidas_sin_definir` (spec §8.2). */
export function destinatariosRecordatorio(p: { sinDefinir: string[]; perfiles: PerfilAviso[] }): string[] {
  return filtrar(p.perfiles, new Set(p.sinDefinir), 'avisar_hora_limite')
}

/**
 * Mensaje que queda esperando aprobación (de un Residente, o corregido tras un rechazo): solo a los
 * Directores, que son quienes pueden verlo y aprobarlo. Nunca al autor.
 */
export function destinatariosPendiente(p: { autorId: string; perfiles: PerfilAviso[] }): string[] {
  return filtrar(p.perfiles, conRol(p.perfiles, ['director']), 'avisar_mensajes', p.autorId)
}

/** "Tu mensaje fue aprobado / no fue aprobado": al autor, nunca a quien lo moderó. */
export function destinatarioModeracion(p: { autorId: string; moderadorId: string; perfiles: PerfilAviso[] }): string[] {
  return filtrar(p.perfiles, new Set([p.autorId]), 'avisar_mensajes', p.moderadorId)
}

/**
 * "El Director cambió algo tuyo" (comida, plan o ausencia): a la persona, si tiene comidas, nunca a
 * quien hizo el cambio (el Director que cambia lo suyo no se avisa a sí mismo).
 */
export function destinatarioCambio(p: { personaId: string; actorId: string; perfiles: PerfilAviso[] }): string[] {
  const candidatos = new Set([...conRol(p.perfiles, ROLES_CON_COMIDAS)].filter((id) => id === p.personaId))
  return filtrar(p.perfiles, candidatos, 'avisar_cambios', p.actorId)
}

/** Cambios para la cocina (extras, pedidos de eventos): a Administración, nunca a quien los hizo. */
export function destinatariosCocina(p: { actorId: string; perfiles: PerfilAviso[] }): string[] {
  return filtrar(p.perfiles, conRol(p.perfiles, ['administracion']), 'avisar_cocina', p.actorId)
}

/**
 * Reparte a los destinatarios según cómo ven a las demás personas: quienes conocen el nombre y
 * quienes solo ven siglas (Administración). El servidor arma un aviso distinto para cada grupo,
 * porque el título de una notificación ("Ana Torres publicó un mensaje") sale del servidor tal cual.
 * Un id sin rol conocido va al grupo de siglas: ante la duda, lo más privado.
 */
export function separarPorVisibilidad(
  ids: string[],
  roles: { id: string; rol: Rol }[],
): { conNombre: string[]; soloSiglas: string[] } {
  const rolDe = new Map(roles.map((p) => [p.id, p.rol]))
  const conNombre: string[] = []
  const soloSiglas: string[] = []
  for (const id of ids) (veSoloSiglas(rolDe.get(id)) ? soloSiglas : conNombre).push(id)
  return { conNombre, soloSiglas }
}
