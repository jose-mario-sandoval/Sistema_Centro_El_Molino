import { z } from 'zod'
import { CONTRASTES, TAMANOS, TEMAS } from '@/lib/apariencia'

/** Ajustes de apariencia de la propia cuenta. Al menos uno; los valores son los mismos que los checks de `perfiles`. */
export const esquemaApariencia = z
  .object({
    tema: z.enum(TEMAS).optional(),
    contraste: z.enum(CONTRASTES).optional(),
    texto: z.enum(TAMANOS).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: 'No hay ningún ajuste para guardar.' })
