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
