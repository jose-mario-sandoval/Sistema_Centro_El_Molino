'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { TIEMPOS_COMIDA } from '@/lib/comidas/tipos'
import {
  esErrorAuthDefinitivo,
  esErrorPerfilEsperado,
  MENSAJE_CORREO_REPETIDO,
  mensajeErrorPerfil,
} from '@/lib/configuraciones/errores'
import type { DatosMiCuenta } from '@/lib/configuraciones/tipos'
import { crearCuenta } from '@/lib/cuentas/crear-cuenta'
import { verificarContrasena } from '@/lib/cuentas/verificar-contrasena'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'
import {
  esquemaCambioContrasenaPropia,
  esquemaCambioRol,
  esquemaContrasenaTemporal,
  esquemaEstadoCuenta,
  esquemaHorasLimite,
  esquemaNuevaCuenta,
  esquemaPerfilPropio,
} from '@/lib/validacion/configuraciones'

const MENSAJE_REVISAR = 'Revisá los datos.'

/** `ban_duration` de Supabase Auth: ~100 años equivale a un bloqueo sin fecha de fin. */
const DURACION_BLOQUEO = '876000h'

// Los registros llevan el id de la cuenta afectada y el error original; nunca contraseñas ni el FormData.

// ---------- Mi cuenta (cualquier rol, solo la propia cuenta) ----------

export async function guardarMiCuenta(
  _previo: Resultado<DatosMiCuenta> | null,
  formData: FormData,
): Promise<Resultado<DatosMiCuenta>> {
  const acceso = await perfilParaAccion()
  if (!acceso.ok) return acceso
  const { perfil } = acceso

  const entrada = esquemaPerfilPropio.safeParse({
    nombre: formData.get('nombre'),
    siglas: formData.get('siglas'),
    correo: formData.get('correo'),
  })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))
  const { nombre, siglas, correo } = entrada.data

  const admin = crearClienteAdmin()
  const cambiaCorreo = correo !== perfil.correo

  // Spec §4: el correo se cambia por el servidor, sin confirmación, validando unicidad.
  if (cambiaCorreo) {
    const { data: otra, error: errorBusqueda } = await admin
      .from('perfiles')
      .select('id')
      .eq('correo', correo)
      .neq('id', perfil.id)
      .maybeSingle()
    if (errorBusqueda) {
      console.error(`guardarMiCuenta: no se pudo validar el correo (usuario ${perfil.id})`, errorBusqueda)
      return fallo('No se pudieron guardar los cambios. Intentá de nuevo.')
    }
    if (otra) return fallo(MENSAJE_REVISAR, { correo: MENSAJE_CORREO_REPETIDO })

    const { error } = await admin.auth.admin.updateUserById(perfil.id, { email: correo, email_confirm: true })
    if (error) {
      if (error.code === 'email_exists') return fallo(MENSAJE_REVISAR, { correo: MENSAJE_CORREO_REPETIDO })
      console.error(`guardarMiCuenta: Auth no cambió el correo (usuario ${perfil.id})`, error)
      return fallo('No se pudo cambiar el correo. Intentá de nuevo.')
    }
  }

  const { error } = await admin.from('perfiles').update({ nombre, siglas, correo }).eq('id', perfil.id)
  if (error) {
    if (!esErrorPerfilEsperado(error)) {
      console.error(`guardarMiCuenta: no se pudo actualizar el perfil (usuario ${perfil.id})`, error)
    }
    // Deja Auth como estaba para que el login y el perfil no queden con correos distintos.
    if (cambiaCorreo) {
      const { error: errorReversion } = await admin.auth.admin.updateUserById(perfil.id, {
        email: perfil.correo,
        email_confirm: true,
      })
      if (errorReversion) {
        console.error(
          `guardarMiCuenta: no se pudo devolver el correo de Auth al anterior (usuario ${perfil.id})`,
          errorReversion,
        )
      }
    }
    const mensaje = mensajeErrorPerfil(error, 'No se pudieron guardar los cambios. Intentá de nuevo.')
    if (mensaje === MENSAJE_CORREO_REPETIDO) return fallo(MENSAJE_REVISAR, { correo: mensaje })
    return fallo(mensaje)
  }

  revalidatePath('/configuraciones')
  revalidatePath('/', 'layout') // la barra lateral muestra nombre y siglas
  return exito({ nombre, siglas, correo })
}

export async function cambiarMiContrasena(
  _previo: Resultado<null> | null,
  formData: FormData,
): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion()
  if (!acceso.ok) return acceso
  const { perfil } = acceso

  const entrada = esquemaCambioContrasenaPropia.safeParse({
    actual: formData.get('actual'),
    nueva: formData.get('nueva'),
    confirmacion: formData.get('confirmacion'),
  })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))

  // El correo de inicio de sesión sale de Auth, no de `perfiles`: si alguna vez quedaran distintos,
  // la verificación usa el que Auth acepta. `getUser()` y no `getClaims()`: el JWT conserva el correo
  // anterior hasta renovarse si la persona acaba de cambiarlo.
  const supabase = await crearClienteServidor()
  const { data: sesion, error: errorSesion } = await supabase.auth.getUser()
  const correoSesion = sesion.user?.id === perfil.id ? sesion.user.email : undefined
  if (errorSesion || !correoSesion) {
    if (errorSesion) console.error(`cambiarMiContrasena: sin usuario de Auth (usuario ${perfil.id})`, errorSesion)
    return fallo('Tu sesión expiró. Volvé a iniciar sesión.')
  }

  const correcta = await verificarContrasena(correoSesion, entrada.data.actual)
  if (!correcta) return fallo(MENSAJE_REVISAR, { actual: 'La contraseña actual no es correcta.' })

  // Con la sesión, no con el cliente admin: Auth cierra las demás sesiones y conserva esta.
  // `auth.admin.updateUserById` cerraría todas, incluida la de este navegador.
  const { error } = await supabase.auth.updateUser({ password: entrada.data.nueva })
  if (error) {
    if (error.code === 'same_password') {
      return fallo(MENSAJE_REVISAR, { nueva: 'La contraseña nueva debe ser distinta de la actual.' })
    }
    if (error.code === 'weak_password') {
      return fallo(MENSAJE_REVISAR, { nueva: 'La contraseña es demasiado débil. Probá con una más larga.' })
    }
    console.error(`cambiarMiContrasena: Auth no cambió la contraseña (usuario ${perfil.id})`, error)
    return fallo('No se pudo cambiar la contraseña. Intentá de nuevo.')
  }

  revalidatePath('/configuraciones')
  return exito(null)
}

// ---------- Horas límite (Director) ----------

export async function guardarHorasLimite(
  _previo: Resultado<null> | null,
  formData: FormData,
): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const entrada = esquemaHorasLimite.safeParse(Object.fromEntries(formData))
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))
  const horas = entrada.data

  // Con la sesión del usuario: RLS permite UPDATE solo al Director (spec §5.2).
  // `.select()` detecta el caso en que RLS filtra la fila sin dar error (0 filas).
  const supabase = await crearClienteServidor()
  const resultados = await Promise.all(
    TIEMPOS_COMIDA.map((comida) =>
      supabase
        .from('horas_limite')
        .update({ dia_relativo: horas[comida].diaRelativo, hora: horas[comida].hora })
        .eq('comida', comida)
        .select('comida'),
    ),
  )
  const fallidas = resultados.flatMap(({ data, error }, i) =>
    error || !data?.length ? [{ comida: TIEMPOS_COMIDA[i], error }] : [],
  )

  // También ante un fallo: las comidas que sí se guardaron deben verse como vigentes.
  revalidatePath('/configuraciones')

  if (fallidas.length > 0) {
    for (const { comida, error } of fallidas) {
      console.error(`guardarHorasLimite: no se guardó ${comida}`, error ?? 'RLS no devolvió la fila')
    }
    return fallo('No se pudieron guardar las horas límite. Intentá de nuevo.')
  }
  return exito(null)
}

// ---------- Gestión de usuarios (Director) ----------

export async function crearNuevaCuenta(
  _previo: Resultado<{ id: string }> | null,
  formData: FormData,
): Promise<Resultado<{ id: string }>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const entrada = esquemaNuevaCuenta.safeParse({
    nombre: formData.get('nombre'),
    siglas: formData.get('siglas'),
    correo: formData.get('correo'),
    rol: formData.get('rol'),
    contrasena: formData.get('contrasena'),
  })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))

  const admin = crearClienteAdmin()
  const { data: existente, error: errorBusqueda } = await admin
    .from('perfiles')
    .select('id')
    .eq('correo', entrada.data.correo)
    .maybeSingle()
  if (errorBusqueda) {
    console.error('crearNuevaCuenta: no se pudo validar el correo', errorBusqueda)
    return fallo('No se pudo crear la cuenta. Intentá de nuevo.')
  }
  if (existente) return fallo(MENSAJE_REVISAR, { correo: MENSAJE_CORREO_REPETIDO })

  // crearCuenta registra el error y borra el usuario de Auth si falla el perfil (spec §4).
  const resultado = await crearCuenta(admin, { ...entrada.data, debeCambiarContrasena: true })
  if (!resultado.ok) {
    // Auth detecta un correo repetido que `perfiles` no tenía (p. ej. un usuario de Auth sin perfil).
    if (resultado.error === MENSAJE_CORREO_REPETIDO) return fallo(MENSAJE_REVISAR, { correo: resultado.error })
    return fallo(resultado.error)
  }

  revalidatePath('/configuraciones')
  return exito({ id: resultado.id })
}

export async function cambiarRolCuenta(entrada: unknown): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const datos = esquemaCambioRol.safeParse(entrada)
  if (!datos.success) return fallo('Datos inválidos.')
  const { id, rol } = datos.data
  if (id === acceso.perfil.id) return fallo('No podés cambiar tu propio rol.')

  const { data, error } = await crearClienteAdmin().from('perfiles').update({ rol }).eq('id', id).select('id')
  if (error) {
    if (!esErrorPerfilEsperado(error)) {
      console.error(`cambiarRolCuenta: no se pudo cambiar el rol (usuario ${id})`, error)
    }
    return fallo(mensajeErrorPerfil(error, 'No se pudo cambiar el rol. Intentá de nuevo.'))
  }
  if (data.length === 0) return fallo('La cuenta no existe.')

  revalidatePath('/configuraciones')
  return exito(null)
}

export async function ponerContrasenaTemporal(
  _previo: Resultado<null> | null,
  formData: FormData,
): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const entrada = esquemaContrasenaTemporal.safeParse({
    id: formData.get('id'),
    contrasena: formData.get('contrasena'),
  })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))
  const { id, contrasena } = entrada.data
  if (id === acceso.perfil.id) return fallo('Tu propia contraseña se cambia en "Mi cuenta".')

  const admin = crearClienteAdmin()
  const { data: cuenta, error: errorLectura } = await admin
    .from('perfiles')
    .select('debe_cambiar_contrasena')
    .eq('id', id)
    .maybeSingle()
  if (errorLectura) {
    console.error(`ponerContrasenaTemporal: no se pudo leer la cuenta (usuario ${id})`, errorLectura)
    return fallo('No se pudo poner la contraseña temporal. Intentá de nuevo.')
  }
  if (!cuenta) return fallo('La cuenta no existe.')

  // Primero la marca: nunca queda una contraseña conocida por el Director sin cambio obligatorio.
  const { error: errorMarca } = await admin.from('perfiles').update({ debe_cambiar_contrasena: true }).eq('id', id)
  if (errorMarca) {
    console.error(`ponerContrasenaTemporal: no se pudo marcar el cambio obligatorio (usuario ${id})`, errorMarca)
    return fallo('No se pudo poner la contraseña temporal. Intentá de nuevo.')
  }

  // Con el cliente admin, Auth cierra además todas las sesiones abiertas de esa persona.
  const { error } = await admin.auth.admin.updateUserById(id, { password: contrasena })
  if (error) {
    console.error(`ponerContrasenaTemporal: Auth no confirmó la contraseña (usuario ${id})`, error)
    revalidatePath('/configuraciones')

    // Si no se sabe si Auth la aplicó, la marca queda en true: puede haber una contraseña que conoce el Director.
    if (!esErrorAuthDefinitivo(error)) {
      return fallo(
        'No se pudo confirmar la contraseña temporal. Volvé a ponerla para asegurarte de que quedó guardada.',
      )
    }

    // Auth la rechazó: la contraseña anterior sigue vigente y la marca vuelve a como estaba.
    if (!cuenta.debe_cambiar_contrasena) {
      const { error: errorReversion } = await admin
        .from('perfiles')
        .update({ debe_cambiar_contrasena: false })
        .eq('id', id)
      if (errorReversion) {
        console.error(`ponerContrasenaTemporal: no se pudo quitar la marca de cambio (usuario ${id})`, errorReversion)
      }
    }
    if (error.code === 'weak_password') {
      return fallo(MENSAJE_REVISAR, { contrasena: 'La contraseña es demasiado débil. Probá con una más larga.' })
    }
    return fallo('No se pudo poner la contraseña temporal. Intentá de nuevo.')
  }

  revalidatePath('/configuraciones')
  return exito(null)
}

export async function cambiarEstadoCuenta(entrada: unknown): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const datos = esquemaEstadoCuenta.safeParse(entrada)
  if (!datos.success) return fallo('Datos inválidos.')
  const { id, activo } = datos.data
  if (id === acceso.perfil.id) return fallo('No podés desactivar tu propia cuenta.')

  const admin = crearClienteAdmin()
  const verbo = activo ? 'reactivar' : 'desactivar'

  // Spec §4, en este orden: 1) perfiles.activo (el trigger MOL02 puede rechazarlo), 2) bloqueo en Auth.
  const { data, error } = await admin.from('perfiles').update({ activo }).eq('id', id).select('id')
  if (error) {
    if (!esErrorPerfilEsperado(error)) {
      console.error(`cambiarEstadoCuenta: no se pudo ${verbo} el perfil (usuario ${id})`, error)
    }
    return fallo(mensajeErrorPerfil(error, `No se pudo ${verbo} la cuenta. Intentá de nuevo.`))
  }
  if (data.length === 0) return fallo('La cuenta no existe.')

  const { error: errorAuth } = await admin.auth.admin.updateUserById(id, {
    ban_duration: activo ? 'none' : DURACION_BLOQUEO,
  })
  if (errorAuth) {
    const paso = activo ? 'desbloqueo' : 'bloqueo'
    console.error(`cambiarEstadoCuenta: Auth no confirmó el ${paso} (usuario ${id})`, errorAuth)

    // Ante la duda gana el estado más estricto (desactivada): solo vuelve a activa si Auth rechazó el bloqueo
    // sin aplicarlo. Al reactivar, `activo` vuelve siempre a false (spec §4: si el bloqueo falla, se revierte).
    const activoFinal = !activo && esErrorAuthDefinitivo(errorAuth)
    let activoGuardado = activo
    if (activoFinal !== activo) {
      const { error: errorReversion } = await admin.from('perfiles').update({ activo: activoFinal }).eq('id', id)
      if (errorReversion) {
        console.error(`cambiarEstadoCuenta: no se pudo revertir activo (usuario ${id})`, errorReversion)
      } else {
        activoGuardado = activoFinal
      }
    }
    revalidatePath('/configuraciones')

    if (!activo && !activoGuardado) {
      return fallo('La cuenta quedó desactivada, pero no se confirmó el bloqueo. Reactivala y volvé a desactivarla.')
    }
    return fallo(`No se pudo ${verbo} la cuenta. Intentá de nuevo.`)
  }

  revalidatePath('/configuraciones')
  return exito(null)
}
