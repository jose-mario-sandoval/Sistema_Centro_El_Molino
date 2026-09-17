import { z } from 'zod'

export const esquemaLogin = z.object({
  correo: z.string().trim().toLowerCase().email('Ingresá un correo válido.'),
  contrasena: z.string().min(1, 'Ingresá tu contraseña.'),
})

export const esquemaContrasenaNueva = z
  .object({
    nueva: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.'),
    confirmacion: z.string(),
  })
  .refine((d) => d.nueva === d.confirmacion, {
    message: 'Las contraseñas no coinciden.',
    path: ['confirmacion'],
  })

/** Convierte los errores de zod en { campo: mensaje } para mostrarlos junto a cada campo. */
export function camposConError(error: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {}
  for (const issue of error.issues) {
    const clave = String(issue.path[0] ?? 'formulario')
    campos[clave] ??= issue.message
  }
  return campos
}
