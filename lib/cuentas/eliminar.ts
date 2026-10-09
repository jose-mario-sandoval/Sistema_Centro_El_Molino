/*
 * Eliminar una cuenta definitivamente (solo el Director, y solo una cuenta desactivada). Borra el
 * usuario de Auth y, en cascada, su perfil y todo lo suyo. Lo que es de la casa —los eventos, las
 * series y los enlaces de cena que esa persona cargó— se conserva (migración 20261008100000).
 * Acá, los textos que le dicen al Director qué se pierde antes de confirmar. Puro.
 */

/** Lo que devuelve `resumen_para_eliminar_cuenta()`, sin `activo`. */
export type ResumenEliminacion = {
  /** Publicaciones y respuestas que escribió. */
  mensajes: number
  /** Respuestas de otras personas dentro de sus publicaciones: se borran con la publicación. */
  respuestasDeOtros: number
  /** Eventos que cargó en el calendario: se conservan. */
  eventos: number
}

function cantidad(n: number, uno: string, varios: string): string {
  return n === 1 ? `1 ${uno}` : `${n} ${varios}`
}

/**
 * 'Se borra todo lo suyo: sus comidas, su plan, sus ausencias y sus 3 mensajes, con las 2 respuestas
 * que otras personas escribieron en sus publicaciones.' En tercera persona: el Director actúa sobre
 * otra cuenta.
 */
export function textoLoQueSeBorra({ mensajes, respuestasDeOtros }: ResumenEliminacion): string {
  const base = 'Se borra todo lo suyo: sus comidas, su plan, sus ausencias'
  if (mensajes === 0) return `${base} y sus avisos. No tiene mensajes.`
  const propios = mensajes === 1 ? 'su mensaje' : `sus ${mensajes} mensajes`
  if (respuestasDeOtros === 0) return `${base} y ${propios}.`
  const ajenas =
    respuestasDeOtros === 1
      ? 'la respuesta que otra persona escribió'
      : `las ${respuestasDeOtros} respuestas que otras personas escribieron`
  return `${base} y ${propios}, con ${ajenas} en sus publicaciones.`
}

/** 'Los 3 eventos que cargó en el calendario se conservan.' · null si no cargó ninguno. */
export function textoLoQueSeConserva({ eventos }: ResumenEliminacion): string | null {
  if (eventos === 0) return null
  return eventos === 1
    ? 'El evento que cargó en el calendario se conserva.'
    : `Los ${cantidad(eventos, 'evento', 'eventos')} que cargó en el calendario se conservan.`
}
