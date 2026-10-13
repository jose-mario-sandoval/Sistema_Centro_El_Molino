/*
 * "Enviar aviso de prueba" (Ajustes → Notificaciones): qué pasó con el envío y cómo se le cuenta a quien
 * lo pidió. Sin 'server-only' ni dependencias del servidor: lo arma lib/push/enviar.ts y lo prueba un test.
 */

export type FalloEnvio = {
  /** Código HTTP del servicio push (Apple, Google, Mozilla), o null si ni respondió (red, tiempo agotado). */
  codigo: number | null
  /** Motivo que da el servicio (p. ej. "BadJwtToken" en Apple), si lo hay. Texto corto, sin datos de nadie. */
  motivo: string | null
}

export type ResultadoPrueba = {
  /** Cuántos dispositivos de la cuenta se intentó avisar. */
  dispositivos: number
  enviadas: number
  fallos: FalloEnvio[]
  /** El servidor no tiene las llaves VAPID (variables de entorno). */
  sinConfiguracion?: boolean
}

export type MensajePrueba = { llego: boolean; texto: string }

const REVISAR_TELEFONO =
  'Si no te aparece en unos segundos, revisá en los ajustes del teléfono que esta app tenga las notificaciones permitidas y que no esté activado «No molestar» ni un modo Concentración.'

function detalle(fallo: FalloEnvio): string {
  return fallo.motivo ? `${fallo.codigo}: ${fallo.motivo}` : String(fallo.codigo)
}

/** Lo que se le muestra a la persona. Un solo fallo basta para contar qué anda mal. */
export function mensajeDePrueba(r: ResultadoPrueba): MensajePrueba {
  if (r.sinConfiguracion) {
    return {
      llego: false,
      texto: 'El servidor no tiene configuradas las llaves de los avisos (VAPID). Revisá las variables de entorno en Vercel.',
    }
  }
  if (r.dispositivos === 0) {
    return {
      llego: false,
      texto: 'Este dispositivo no está registrado en el servidor. Desactivá las notificaciones y volvé a activarlas.',
    }
  }
  const fallo = r.fallos[0]
  if (!fallo) {
    return { llego: true, texto: `El servicio de avisos aceptó el envío. ${REVISAR_TELEFONO}` }
  }
  if (fallo.codigo === 401 || fallo.codigo === 403) {
    return {
      llego: false,
      texto: `El servicio de avisos rechazó la firma del servidor (error ${detalle(fallo)}). Revisá en Vercel que VAPID_SUBJECT empiece con «mailto:» o «https://» y que las llaves VAPID pública y privada sean un par.`,
    }
  }
  if (fallo.codigo === 404 || fallo.codigo === 410) {
    return {
      llego: false,
      texto: 'Este dispositivo ya no es válido para el servicio de avisos. Desactivá las notificaciones y volvé a activarlas.',
    }
  }
  if (fallo.codigo === null) {
    return { llego: false, texto: 'El servicio de avisos no respondió. Intentá de nuevo en un momento.' }
  }
  return {
    llego: false,
    texto: `El servicio de avisos respondió con un error (${detalle(fallo)}). Intentá de nuevo en un momento.`,
  }
}
