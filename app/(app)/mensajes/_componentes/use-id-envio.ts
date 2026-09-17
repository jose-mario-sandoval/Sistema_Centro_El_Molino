'use client'

import { useRef } from 'react'
import { confirmarEnvio, prepararEnvio, type EnvioPendiente } from '@/lib/mensajes/envio'

/**
 * Id del mensaje generado en el navegador, para que publicar y responder sean idempotentes (ver prepararEnvio).
 * Se genera al enviar y no al renderizar: así no difiere entre el HTML del servidor y la hidratación.
 */
export function useIdEnvio() {
  const pendiente = useRef<EnvioPendiente | null>(null)
  return {
    /** Agrega `id` a los datos del formulario: el mismo mientras se reintente el mismo texto. */
    asignar(datos: FormData) {
      pendiente.current = prepararEnvio(pendiente.current, String(datos.get('texto') ?? ''), () => crypto.randomUUID())
      datos.set('id', pendiente.current.id)
    },
    /** Llamar cuando la acción devuelve éxito: el próximo mensaje lleva un id nuevo. */
    confirmar(id: string) {
      pendiente.current = confirmarEnvio(pendiente.current, id)
    },
  }
}
