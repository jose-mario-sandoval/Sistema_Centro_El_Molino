import type { Rol } from '@/lib/perfiles/roles'
import { veSoloSiglas } from '@/lib/perfiles/visibilidad'

/** Datos del perfil que deciden si una persona recibe un aviso (columnas de `perfiles`). */
export type PerfilAviso = {
  id: string
  activo: boolean
  avisar_mensajes: boolean
  avisar_hora_limite: boolean
}

type Preferencia = 'avisar_mensajes' | 'avisar_hora_limite'

/** Ids de `candidatos` activos y con la preferencia, en el orden de `perfiles`, sin `excluir`. */
function filtrar(perfiles: PerfilAviso[], candidatos: Set<string>, preferencia: Preferencia, excluir?: string): string[] {
  return perfiles
    .filter((p) => candidatos.has(p.id) && p.id !== excluir && p.activo && p[preferencia])
    .map((p) => p.id)
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
