/** Mensaje enviado y todavía sin confirmar: su id se reusa en los reintentos. */
export type EnvioPendiente = { id: string; texto: string }

/**
 * Id con el que se envía `texto` (lo genera el navegador). Mientras no se confirme, reintentar el mismo
 * texto reusa el id: si el intento anterior sí llegó a la base y solo se perdió la respuesta, el reintento
 * choca con la clave primaria y la acción lo toma como éxito, sin duplicar el mensaje. Un texto distinto es
 * otro mensaje y lleva un id nuevo, para no dar por publicado un texto que nunca se guardó.
 */
export function prepararEnvio(pendiente: EnvioPendiente | null, texto: string, nuevoId: () => string): EnvioPendiente {
  const recortado = texto.trim()
  return pendiente?.texto === recortado ? pendiente : { id: nuevoId(), texto: recortado }
}

/** Tras un envío correcto se descarta el pendiente (si sigue siendo ese): el próximo mensaje lleva otro id. */
export function confirmarEnvio(pendiente: EnvioPendiente | null, id: string): EnvioPendiente | null {
  return pendiente?.id === id ? null : pendiente
}
