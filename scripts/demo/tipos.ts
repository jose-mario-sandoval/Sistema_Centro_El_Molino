import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export const DOMINIO_DEMO = 'demo.test'
export const CONTRASENA_DEMO = 'demo-molino-2026'

export type ClaveDemo = 'director' | 'sacerdote' | 'numerario' | 'residente' | 'administracion'
export type UsuariosDemo = Record<ClaveDemo, string>

export type Sembrador = (admin: SupabaseClient<Database>, usuarios: UsuariosDemo) => Promise<void>
