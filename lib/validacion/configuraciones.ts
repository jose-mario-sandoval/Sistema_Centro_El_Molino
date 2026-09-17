import { z } from 'zod'
import type { HorasLimite } from '@/lib/comidas/tipos'
import { ROLES } from '@/lib/perfiles/roles'
import { esquemaContrasenaNueva } from '@/lib/validacion/auth'

const MENSAJE_MINIMO_CONTRASENA = 'La contraseña debe tener al menos 8 caracteres.'

// Límites iguales a los checks de la tabla perfiles (Fase 0, migración base).
const nombre = z.string().trim().min(1, 'Ingresá el nombre.').max(120, 'El nombre puede tener hasta 120 caracteres.')
const siglas = z
  .string()
  .trim()
  .min(1, 'Ingresá las siglas.')
  .max(6, 'Las siglas pueden tener hasta 6 caracteres.')
  .toUpperCase()
const correo = z.string().trim().toLowerCase().email('Ingresá un correo válido.')
const contrasenaTemporal = z.string().min(8, MENSAJE_MINIMO_CONTRASENA)
const idCuenta = z.uuid('Cuenta inválida.')
const rol = z.enum(ROLES, { error: 'Elegí un rol.' })

// ---------- Mi cuenta ----------

/** Nombre, siglas y correo de la propia cuenta (spec §4). */
export const esquemaPerfilPropio = z.object({ nombre, siglas, correo })

/** Cambio de la propia contraseña: pide la actual (spec §4). */
export const esquemaCambioContrasenaPropia = z
  .object({ actual: z.string().min(1, 'Ingresá tu contraseña actual.') })
  .and(esquemaContrasenaNueva)
  .refine((d) => d.nueva !== d.actual, {
    message: 'La contraseña nueva debe ser distinta de la actual.',
    path: ['nueva'],
  })

// ---------- Horas límite ----------

const diaRelativo = z
  .enum(['0', '-1'], { error: 'Elegí mismo día o día anterior.' })
  .transform((valor): 0 | -1 => (valor === '-1' ? -1 : 0))

const hora = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Ingresá una hora válida (HH:MM).')
  .transform((valor) => valor.slice(0, 5))

/** Campos planos del formulario (`<comida>_dia`, `<comida>_hora`) → HorasLimite. */
export const esquemaHorasLimite = z
  .object({
    desayuno_dia: diaRelativo,
    desayuno_hora: hora,
    almuerzo_dia: diaRelativo,
    almuerzo_hora: hora,
    cena_dia: diaRelativo,
    cena_hora: hora,
  })
  .transform(
    (d): HorasLimite => ({
      desayuno: { diaRelativo: d.desayuno_dia, hora: d.desayuno_hora },
      almuerzo: { diaRelativo: d.almuerzo_dia, hora: d.almuerzo_hora },
      cena: { diaRelativo: d.cena_dia, hora: d.cena_hora },
    }),
  )

// ---------- Gestión de usuarios (Director) ----------

export const esquemaNuevaCuenta = z.object({ nombre, siglas, correo, rol, contrasena: contrasenaTemporal })

export const esquemaContrasenaTemporal = z.object({ id: idCuenta, contrasena: contrasenaTemporal })

export const esquemaCambioRol = z.object({ id: idCuenta, rol })

export const esquemaEstadoCuenta = z.object({ id: idCuenta, activo: z.boolean({ error: 'Estado inválido.' }) })
