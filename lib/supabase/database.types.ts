export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      horas_limite: {
        Row: {
          comida: Database['public']['Enums']['tiempo_comida']
          dia_relativo: number
          hora: string
        }
        Insert: {
          comida: Database['public']['Enums']['tiempo_comida']
          dia_relativo: number
          hora: string
        }
        Update: {
          comida?: Database['public']['Enums']['tiempo_comida']
          dia_relativo?: number
          hora?: string
        }
        Relationships: []
      }
      perfiles: {
        Row: {
          activo: boolean
          avisar_hora_limite: boolean
          avisar_mensajes: boolean
          correo: string
          creado_en: string
          debe_cambiar_contrasena: boolean
          id: string
          nombre: string
          rol: Database['public']['Enums']['rol']
          siglas: string
        }
        Insert: {
          activo?: boolean
          avisar_hora_limite?: boolean
          avisar_mensajes?: boolean
          correo: string
          creado_en?: string
          debe_cambiar_contrasena?: boolean
          id: string
          nombre: string
          rol: Database['public']['Enums']['rol']
          siglas: string
        }
        Update: {
          activo?: boolean
          avisar_hora_limite?: boolean
          avisar_mensajes?: boolean
          correo?: string
          creado_en?: string
          debe_cambiar_contrasena?: boolean
          id?: string
          nombre?: string
          rol?: Database['public']['Enums']['rol']
          siglas?: string
        }
        Relationships: []
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      mi_rol: { Args: never; Returns: Database['public']['Enums']['rol'] }
      soy_activo: { Args: never; Returns: boolean }
      zona_horaria_app: { Args: never; Returns: string }
    }
    Enums: {
      estado_comida: 'si' | 'no' | 'temprano' | 'tarde' | 'bolsa' | 'enfermo'
      origen_seleccion: 'persona' | 'plan'
      rol: 'director' | 'residente' | 'administracion'
      tiempo_comida: 'desayuno' | 'almuerzo' | 'cena'
    }
    CompositeTypes: { [_ in never]: never }
  }
}
