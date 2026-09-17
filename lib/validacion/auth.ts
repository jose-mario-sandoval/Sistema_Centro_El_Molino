import { z } from 'zod'

export const MENSAJE_MINIMO_CONTRASENA = 'La contraseña debe tener al menos 8 caracteres.'
/** Supabase Auth (bcrypt) no admite contraseñas de más de 72 caracteres. */
export const MENSAJE_MAXIMO_CONTRASENA = 'La contraseña puede tener hasta 72 caracteres.'

export const esquemaLogin = z.object({
  correo: z.string().trim().toLowerCase().email('Ingresá un correo válido.'),
  contrasena: z.string().min(1, 'Ingresá tu contraseña.'),
})

export const esquemaContrasenaNueva = z
  .object({
    nueva: z.string().min(8, MENSAJE_MINIMO_CONTRASENA).max(72, MENSAJE_MAXIMO_CONTRASENA),
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
