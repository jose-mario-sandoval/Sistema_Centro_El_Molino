import type { Database } from './database.types'

export type Tabla<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Enum<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]
