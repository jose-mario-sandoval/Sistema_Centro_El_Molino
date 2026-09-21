import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { exigirBaseLocal } from './entorno-local'

export const CONTRASENA_PRUEBA = 'clave-de-prueba-123'

export const USUARIOS_PRUEBA = {
  director: { correo: 'director@prueba.test', nombre: 'Directora Prueba', siglas: 'DP', rol: 'director' },
  director2: { correo: 'director2@prueba.test', nombre: 'Director Dos', siglas: 'D2', rol: 'director' },
  residente: { correo: 'residente@prueba.test', nombre: 'Residente Prueba', siglas: 'RP', rol: 'residente' },
  residente2: { correo: 'residente2@prueba.test', nombre: 'Residente Dos', siglas: 'R2', rol: 'residente' },
  administracion: { correo: 'admin@prueba.test', nombre: 'Administración Prueba', siglas: 'AP', rol: 'administracion' },
} as const

export type ClaveUsuario = keyof typeof USUARIOS_PRUEBA

function url() {
  exigirBaseLocal()
  return process.env.NEXT_PUBLIC_SUPABASE_URL!
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ClienteSinTipo = SupabaseClient<any, 'public', any>

export function clienteAdminPrueba(): ClienteSinTipo {
  return createClient(url(), process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Crea los usuarios de prueba si faltan y los deja activos, con su rol y sin cambio de contraseña pendiente. */
export async function asegurarUsuariosPrueba(): Promise<Record<ClaveUsuario, string>> {
  const admin = clienteAdminPrueba()
  const ids = {} as Record<ClaveUsuario, string>

  for (const [clave, u] of Object.entries(USUARIOS_PRUEBA) as [ClaveUsuario, (typeof USUARIOS_PRUEBA)[ClaveUsuario]][]) {
    const { data: existente } = await admin.from('perfiles').select('id').eq('correo', u.correo).maybeSingle()
    if (existente) {
      await admin.auth.admin.updateUserById(existente.id, { password: CONTRASENA_PRUEBA, ban_duration: 'none' })
      const { error } = await admin
        .from('perfiles')
        .update({
          activo: true,
          rol: u.rol,
          nombre: u.nombre,
          siglas: u.siglas,
          debe_cambiar_contrasena: false,
          // Sin apariencia guardada: cada prueba parte de la cuenta "sin elegir".
          apariencia_tema: null,
          apariencia_contraste: null,
          apariencia_texto: null,
        })
        .eq('id', existente.id)
      if (error) throw error
      ids[clave] = existente.id
      continue
    }
    const { data, error } = await admin.auth.admin.createUser({
      email: u.correo,
      password: CONTRASENA_PRUEBA,
      email_confirm: true,
    })
    if (error) throw error
    const { error: errorPerfil } = await admin
      .from('perfiles')
      .insert({ id: data.user.id, nombre: u.nombre, siglas: u.siglas, correo: u.correo, rol: u.rol })
    if (errorPerfil) throw errorPerfil
    ids[clave] = data.user.id
  }
  return ids
}

/** Cliente con la sesión del usuario de prueba indicado (RLS aplica). */
export async function clienteComo(clave: ClaveUsuario): Promise<ClienteSinTipo> {
  const cliente = createClient(url(), process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await cliente.auth.signInWithPassword({
    email: USUARIOS_PRUEBA[clave].correo,
    password: CONTRASENA_PRUEBA,
  })
  if (error) throw error
  return cliente
}
