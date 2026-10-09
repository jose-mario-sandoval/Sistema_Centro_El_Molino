import { z } from 'zod'
import type { HorasLimite } from '@/lib/comidas/tipos'
import {
  FORMATO_USUARIO,
  LARGO_MAXIMO_USUARIO,
  LARGO_MINIMO_USUARIO,
  normalizarUsuario,
  PREFIJO_DEMO,
} from '@/lib/cuentas/usuario'
import { ROLES } from '@/lib/perfiles/roles'
import { esquemaContrasenaNueva, MENSAJE_MAXIMO_CONTRASENA, MENSAJE_MINIMO_CONTRASENA } from '@/lib/validacion/auth'

// Límites iguales a los checks de la tabla perfiles (Fase 0, migración base).
const nombre = z.string().trim().min(1, 'Ingresá el nombre.').max(120, 'El nombre puede tener hasta 120 caracteres.')
const siglas = z
  .string()
  .trim()
  .min(1, 'Ingresá las siglas.')
  .max(6, 'Las siglas pueden tener hasta 6 caracteres.')
  .toUpperCase()
const MENSAJE_FORMATO_USUARIO = 'Usá solo letras sin tilde, números, punto, guion o guion bajo. Ejemplo: r.flores'

/** El usuario como lo escribe el Director: se normaliza y después se valida (mismo check que la base). */
const usuario = z
  .string()
  .transform(normalizarUsuario)
  .pipe(
    z
      .string()
      .min(LARGO_MINIMO_USUARIO, `El usuario debe tener al menos ${LARGO_MINIMO_USUARIO} caracteres.`)
      .max(LARGO_MAXIMO_USUARIO, `El usuario puede tener hasta ${LARGO_MAXIMO_USUARIO} caracteres.`)
      .regex(FORMATO_USUARIO, MENSAJE_FORMATO_USUARIO)
      // Solo en los formularios: los scripts de demo sí crean cuentas `demo.…`.
      .refine((valor) => !valor.startsWith(PREFIJO_DEMO), 'Ese usuario está reservado. Elegí otro.'),
  )
const contrasenaTemporal = z.string().min(8, MENSAJE_MINIMO_CONTRASENA).max(72, MENSAJE_MAXIMO_CONTRASENA)
const idCuenta = z.uuid('Cuenta inválida.')
const rol = z.enum(ROLES, { error: 'Elegí un rol.' })

// ---------- Mi cuenta ----------

/** Nombre y siglas de la propia cuenta (spec §4). El usuario lo cambia el Director. */
export const esquemaPerfilPropio = z.object({ nombre, siglas })

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

/** Cuenta nueva. Administración no lleva nombre ni siglas: los pone el servidor ("Administración N"). */
export const esquemaNuevaCuenta = z.discriminatedUnion(
  'rol',
  [
    z.object({ rol: z.literal('administracion'), usuario, contrasena: contrasenaTemporal }),
    z.object({ rol: z.enum(['director', 'residente']), nombre, siglas, usuario, contrasena: contrasenaTemporal }),
  ],
  { error: 'Elegí un rol.' },
)

export const esquemaCambioUsuario = z.object({ id: idCuenta, usuario })

export const esquemaContrasenaTemporal = z.object({ id: idCuenta, contrasena: contrasenaTemporal })

export const esquemaCambioRol = z.object({ id: idCuenta, rol })

export const esquemaEstadoCuenta = z.object({ id: idCuenta, activo: z.boolean({ error: 'Estado inválido.' }) })

/** Eliminar una cuenta, o pedir lo que se perdería al hacerlo. */
export const esquemaEliminarCuenta = z.object({ id: idCuenta })
