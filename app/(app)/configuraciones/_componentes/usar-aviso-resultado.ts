import { useEffect } from 'react'
import { useAviso } from '@/components/ui/avisos'
import type { Resultado } from '@/lib/acciones/resultado'

/**
 * Spec §9.1: éxito y errores generales como aviso emergente;
 * los errores de validación (`campos`) se muestran junto a cada campo.
 */
export function useAvisoDeResultado<T>(estado: Resultado<T> | null, textoExito: string | null) {
  const aviso = useAviso()
  useEffect(() => {
    if (!estado) return
    if (estado.ok) {
      if (textoExito) aviso(textoExito)
    } else if (!estado.campos) {
      aviso(estado.error)
    }
  }, [estado, aviso, textoExito])
}
