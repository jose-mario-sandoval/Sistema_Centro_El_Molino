import type { Rol } from '@/lib/perfiles/roles'
import type { PreferenciasAvisos } from '@/lib/validacion/push'

export type ClavePreferencia = keyof PreferenciasAvisos

/** Una casilla de "Qué avisos recibir" en Ajustes. `id` es el del campo (y el de su etiqueta). */
export type OpcionAviso = { clave: ClavePreferencia; id: string; etiqueta: string; ayuda: string }

const RECORDATORIO: OpcionAviso = {
  clave: 'avisarHoraLimite',
  id: 'avisar-hora-limite',
  etiqueta: 'Recordatorio de hora límite',
  ayuda: 'Una hora antes de que cierre una comida que todavía está sin definir.',
}

/**
 * Qué avisos puede apagar cada rol. Administración no tiene comidas propias: ni recordatorios ni
 * cambios del Director, pero sí los cambios para la cocina (spec §8.2 y plan 2026-09-29).
 */
export function opcionesAvisos(rol: Rol): OpcionAviso[] {
  if (rol === 'administracion') {
    return [
      {
        clave: 'avisarMensajes',
        id: 'avisar-mensajes',
        etiqueta: 'Mensajes nuevos',
        ayuda: 'Publicaciones nuevas y respuestas en hilos donde participás.',
      },
      {
        clave: 'avisarCocina',
        id: 'avisar-cocina',
        etiqueta: 'Cambios para la cocina',
        ayuda: 'Extras que se agregan o se quitan, y pedidos de eventos nuevos, cambiados o cancelados.',
      },
    ]
  }

  const esDirector = rol === 'director'
  return [
    {
      clave: 'avisarMensajes',
      id: 'avisar-mensajes',
      etiqueta: 'Mensajes nuevos',
      ayuda: esDirector
        ? 'Publicaciones nuevas, respuestas en hilos donde participás y mensajes que esperan tu aprobación.'
        : 'Publicaciones nuevas, respuestas en hilos donde participás y si tu mensaje fue aprobado.',
    },
    RECORDATORIO,
    {
      clave: 'avisarCambios',
      id: 'avisar-cambios',
      // Solo un Director cambia las comidas de otra persona: para un Director, es otro Director.
      etiqueta: esDirector ? 'Cambios que hace otro Director en mis comidas' : 'Cambios que hace el Director en mis comidas',
      ayuda: esDirector
        ? 'Si otro Director cambia una comida tuya, tu plan o tus ausencias.'
        : 'Si el Director cambia una comida tuya, tu plan o tus ausencias.',
    },
  ]
}

/** Para qué sirven los avisos, en la tarjeta que los ofrece al abrir la app instalada. */
export function textoOfrecerAvisos(rol: Rol): string {
  if (rol === 'administracion') return 'Te avisa cuando hay mensajes nuevos y cambios para la cocina.'
  if (rol === 'director') {
    return 'Te avisa antes de que cierre una comida sin definir, cuando hay mensajes nuevos y cuando hay mensajes por aprobar.'
  }
  return 'Te avisa antes de que cierre una comida sin definir, cuando hay mensajes nuevos y si el Director cambia algo tuyo.'
}

/** El texto bajo el título "Notificaciones": solo lo que ese rol recibe. */
export function descripcionAvisos(rol: Rol): string {
  if (rol === 'administracion') return 'Avisos de mensajes nuevos y de cambios para la cocina.'
  return 'Avisos de mensajes nuevos, recordatorios antes de la hora límite y cambios en tus comidas.'
}
