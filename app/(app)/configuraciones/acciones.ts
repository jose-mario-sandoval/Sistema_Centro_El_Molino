'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { TIEMPOS_COMIDA } from '@/lib/comidas/tipos'
import {
  esErrorAuthDefinitivo,
  esErrorPerfilEsperado,
  MENSAJE_USUARIO_REPETIDO,
  mensajeErrorPerfil,
} from '@/lib/configuraciones/errores'
import type { DatosMiCuenta } from '@/lib/configuraciones/tipos'
import { nombreAdministracion, siglasAdministracion, siguienteNumeroAdministracion } from '@/lib/cuentas/administracion'
import { crearCuenta } from '@/lib/cuentas/crear-cuenta'
import type { ResumenEliminacion } from '@/lib/cuentas/eliminar'
import { verificarContrasena } from '@/lib/cuentas/verificar-contrasena'
import type { Rol } from '@/lib/perfiles/roles'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'
import {
  esquemaCambioContrasenaPropia,
  esquemaCambioRol,
  esquemaCambioUsuario,
  esquemaContrasenaTemporal,
  esquemaEliminarCuenta,
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
  // La casa no ve el nombre real de Administración: el suyo es genérico y no se edita.
  if (perfil.rol === 'administracion') return fallo('En Administración el nombre lo pone la app.')

  const entrada = esquemaPerfilPropio.safeParse({
    nombre: formData.get('nombre'),
    siglas: formData.get('siglas'),
  })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))
  const { nombre, siglas } = entrada.data

  // El usuario con el que se entra no se cambia desde acá: lo cambia el Director (cambiarUsuarioCuenta).
  const { error } = await crearClienteAdmin().from('perfiles').update({ nombre, siglas }).eq('id', perfil.id)
  if (error) {
    console.error(`guardarMiCuenta: no se pudo actualizar el perfil (usuario ${perfil.id})`, error)
    return fallo('No se pudieron guardar los cambios. Intentá de nuevo.')
  }

  revalidatePath('/configuraciones')
  revalidatePath('/', 'layout') // la barra lateral muestra nombre y siglas
  return exito({ nombre, siglas })
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

  // La dirección con la que Auth conoce a la cuenta sale de Auth: `perfiles` no la guarda (la persona
  // entra con su usuario). `getUser()` y no `getClaims()`: el JWT conserva la dirección anterior hasta
  // renovarse si acaba de cambiar.
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

/** Nombre y siglas genéricos para una cuenta que entra a Administración: el número que sigue. */
async function identidadDeAdministracion(admin: ReturnType<typeof crearClienteAdmin>) {
  const { data, error } = await admin.from('perfiles').select('nombre').like('nombre', 'Administración %')
  if (error) return { error }
  const numero = siguienteNumeroAdministracion(data.map((fila) => fila.nombre))
  return { nombre: nombreAdministracion(numero), siglas: siglasAdministracion(numero) }
}

export async function crearNuevaCuenta(
  _previo: Resultado<{ id: string; nombre: string; usuario: string }> | null,
  formData: FormData,
): Promise<Resultado<{ id: string; nombre: string; usuario: string }>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const entrada = esquemaNuevaCuenta.safeParse({
    // Con rol Administración el formulario no pinta nombre ni siglas: los pone el servidor.
    nombre: formData.get('nombre') ?? undefined,
    siglas: formData.get('siglas') ?? undefined,
    usuario: formData.get('usuario'),
    rol: formData.get('rol'),
    contrasena: formData.get('contrasena'),
  })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))
  const datos = entrada.data

  const admin = crearClienteAdmin()
  const { data: existente, error: errorBusqueda } = await admin
    .from('perfiles')
    .select('id')
    .eq('usuario', datos.usuario)
    .maybeSingle()
  if (errorBusqueda) {
    console.error('crearNuevaCuenta: no se pudo validar el usuario', errorBusqueda)
    return fallo('No se pudo crear la cuenta. Intentá de nuevo.')
  }
  if (existente) return fallo(MENSAJE_REVISAR, { usuario: MENSAJE_USUARIO_REPETIDO })

  let identidad: { nombre: string; siglas: string }
  if (datos.rol === 'administracion') {
    const generica = await identidadDeAdministracion(admin)
    if ('error' in generica) {
      console.error('crearNuevaCuenta: no se pudieron leer los nombres de Administración', generica.error)
      return fallo('No se pudo crear la cuenta. Intentá de nuevo.')
    }
    identidad = generica
  } else {
    identidad = { nombre: datos.nombre, siglas: datos.siglas }
  }

  // crearCuenta registra el error y borra el usuario de Auth si falla el perfil (spec §4).
  const resultado = await crearCuenta(admin, {
    ...identidad,
    usuario: datos.usuario,
    rol: datos.rol,
    contrasena: datos.contrasena,
    debeCambiarContrasena: true,
  })
  if (!resultado.ok) {
    // Otra persona creó ese usuario entre la validación y el alta: lo rechaza la base.
    if (resultado.error === MENSAJE_USUARIO_REPETIDO) return fallo(MENSAJE_REVISAR, { usuario: resultado.error })
    return fallo(resultado.error)
  }

  revalidatePath('/configuraciones')
  return exito({ id: resultado.id, nombre: identidad.nombre, usuario: datos.usuario })
}

export async function cambiarRolCuenta(entrada: unknown): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const datos = esquemaCambioRol.safeParse(entrada)
  if (!datos.success) return fallo('Datos inválidos.')
  const { id, rol } = datos.data
  if (id === acceso.perfil.id) return fallo('No podés cambiar tu propio rol.')

  const admin = crearClienteAdmin()
  let cambios: { rol: Rol; nombre?: string; siglas?: string } = { rol }
  if (rol === 'administracion') {
    // Entrar a Administración cambia el nombre por uno genérico (la casa no ve su nombre real);
    // quien ya estaba conserva el suyo.
    const { data: actual, error: errorLectura } = await admin.from('perfiles').select('rol').eq('id', id).maybeSingle()
    if (errorLectura) {
      console.error(`cambiarRolCuenta: no se pudo leer la cuenta (usuario ${id})`, errorLectura)
      return fallo('No se pudo cambiar el rol. Intentá de nuevo.')
    }
    if (!actual) return fallo('La cuenta no existe.')
    if (actual.rol !== 'administracion') {
      const generica = await identidadDeAdministracion(admin)
      if ('error' in generica) {
        console.error(`cambiarRolCuenta: no se pudieron leer los nombres de Administración (usuario ${id})`, generica.error)
        return fallo('No se pudo cambiar el rol. Intentá de nuevo.')
      }
      cambios = { rol, ...generica }
    }
  }

  const { data, error } = await admin.from('perfiles').update(cambios).eq('id', id).select('id')
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

/** El Director cambia el usuario con el que entra una cuenta (también la suya). */
export async function cambiarUsuarioCuenta(
  _previo: Resultado<{ usuario: string }> | null,
  formData: FormData,
): Promise<Resultado<{ usuario: string }>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const entrada = esquemaCambioUsuario.safeParse({ id: formData.get('id'), usuario: formData.get('usuario') })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))
  const { id, usuario } = entrada.data

  // Solo la columna: la dirección interna de Auth no depende del usuario.
  const { data, error } = await crearClienteAdmin().from('perfiles').update({ usuario }).eq('id', id).select('id')
  if (error) {
    if (error.code === '23505') return fallo(MENSAJE_REVISAR, { usuario: MENSAJE_USUARIO_REPETIDO })
    console.error(`cambiarUsuarioCuenta: no se pudo cambiar el usuario (usuario ${id})`, error)
    return fallo('No se pudo cambiar el usuario. Intentá de nuevo.')
  }
  if (data.length === 0) return fallo('La cuenta no existe.')

  revalidatePath('/configuraciones')
  return exito({ usuario })
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

// ---------- Eliminar una cuenta (Director; solo cuentas desactivadas) ----------

const MENSAJE_NO_ELIMINADA = 'No se pudo eliminar la cuenta. Intentá de nuevo.'

/**
 * Comprueba que la cuenta se puede eliminar y devuelve lo que se perdería. Pasa siempre por
 * `resumen_para_eliminar_cuenta()`: esa función llega con la migración que conserva los eventos de
 * la casa (20261008100000), así que si la migración no está aplicada esto falla y no se borra nada.
 */
async function cuentaEliminable(
  admin: ReturnType<typeof crearClienteAdmin>,
  idPropio: string,
  id: string,
): Promise<Resultado<ResumenEliminacion>> {
  if (id === idPropio) return fallo('No podés eliminar tu propia cuenta.')

  const { data, error } = await admin.rpc('resumen_para_eliminar_cuenta', { p_usuario: id }).maybeSingle()
  if (error) {
    console.error(`cuentaEliminable: no se pudo leer la cuenta (usuario ${id})`, error)
    return fallo(MENSAJE_NO_ELIMINADA)
  }
  if (!data) return fallo('La cuenta no existe.')
  // Dos pasos a propósito: nadie borra por error una cuenta que se está usando.
  if (data.activo) return fallo('Primero desactivá la cuenta. Solo se eliminan cuentas desactivadas.')

  return exito({ mensajes: data.mensajes, respuestasDeOtros: data.respuestas_de_otros, eventos: data.eventos })
}

/** Lo que se perdería al eliminar la cuenta: el diálogo lo muestra antes de confirmar. */
export async function resumenParaEliminarCuenta(entrada: unknown): Promise<Resultado<ResumenEliminacion>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const datos = esquemaEliminarCuenta.safeParse(entrada)
  if (!datos.success) return fallo('Datos inválidos.')

  return cuentaEliminable(crearClienteAdmin(), acceso.perfil.id, datos.data.id)
}

/**
 * Elimina la cuenta definitivamente: borra el usuario de Auth y, en cascada, su perfil y todo lo
 * suyo (comidas, plan, ausencias, mensajes, avisos). Los eventos, series y enlaces de cena que cargó
 * se conservan sin autor. No tiene vuelta atrás.
 */
export async function eliminarCuenta(entrada: unknown): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const datos = esquemaEliminarCuenta.safeParse(entrada)
  if (!datos.success) return fallo('Datos inválidos.')
  const { id } = datos.data

  const admin = crearClienteAdmin()
  const eliminable = await cuentaEliminable(admin, acceso.perfil.id, id)
  if (!eliminable.ok) return eliminable

  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) {
    console.error(`eliminarCuenta: Auth no borró la cuenta (usuario ${id})`, error)
    return fallo(MENSAJE_NO_ELIMINADA)
  }

  revalidatePath('/configuraciones')
  // Sus mensajes y su lugar en las comidas ya no están: lo que se ve en el resto de la app cambia.
  revalidatePath('/', 'layout')
  return exito(null)
}
