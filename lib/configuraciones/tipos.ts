import type { Tabla } from '@/lib/supabase/tipos'

/** Fila de la tabla de gestión de usuarios (incluye cuentas desactivadas). */
export type Cuenta = Pick<
  Tabla<'perfiles'>,
  'id' | 'nombre' | 'siglas' | 'correo' | 'rol' | 'activo' | 'debe_cambiar_contrasena'
>
