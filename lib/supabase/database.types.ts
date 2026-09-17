export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      comidas_cerradas: {
        Row: {
          cerrada_en: string
          comida: Database["public"]["Enums"]["tiempo_comida"]
          fecha: string
        }
        Insert: {
          cerrada_en?: string
          comida: Database["public"]["Enums"]["tiempo_comida"]
          fecha: string
        }
        Update: {
          cerrada_en?: string
          comida?: Database["public"]["Enums"]["tiempo_comida"]
          fecha?: string
        }
        Relationships: []
      }
      eventos: {
        Row: {
          actualizado_en: string
          creado_en: string
          creado_por: string
          fecha: string
          hora: string | null
          id: string
          titulo: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          creado_por: string
          fecha: string
          hora?: string | null
          id?: string
          titulo: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          creado_por?: string
          fecha?: string
          hora?: string | null
          id?: string
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "eventos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      horas_limite: {
        Row: {
          comida: Database["public"]["Enums"]["tiempo_comida"]
          dia_relativo: number
          hora: string
        }
        Insert: {
          comida: Database["public"]["Enums"]["tiempo_comida"]
          dia_relativo: number
          hora: string
        }
        Update: {
          comida?: Database["public"]["Enums"]["tiempo_comida"]
          dia_relativo?: number
          hora?: string
        }
        Relationships: []
      }
      mensajes: {
        Row: {
          autor_id: string
          creado_en: string
          id: string
          padre_id: string | null
          texto: string
        }
        Insert: {
          autor_id: string
          creado_en?: string
          id?: string
          padre_id?: string | null
          texto: string
        }
        Update: {
          autor_id?: string
          creado_en?: string
          id?: string
          padre_id?: string | null
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensajes_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensajes_padre_id_fkey"
            columns: ["padre_id"]
            isOneToOne: false
            referencedRelation: "mensajes"
            referencedColumns: ["id"]
          },
        ]
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
          rol: Database["public"]["Enums"]["rol"]
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
          rol: Database["public"]["Enums"]["rol"]
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
          rol?: Database["public"]["Enums"]["rol"]
          siglas?: string
        }
        Relationships: []
      }
      plan_semanal: {
        Row: {
          comida: Database["public"]["Enums"]["tiempo_comida"]
          dia_semana: number
          estado: Database["public"]["Enums"]["estado_comida"]
          nota: string | null
          usuario_id: string
        }
        Insert: {
          comida: Database["public"]["Enums"]["tiempo_comida"]
          dia_semana: number
          estado: Database["public"]["Enums"]["estado_comida"]
          nota?: string | null
          usuario_id: string
        }
        Update: {
          comida?: Database["public"]["Enums"]["tiempo_comida"]
          dia_semana?: number
          estado?: Database["public"]["Enums"]["estado_comida"]
          nota?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_semanal_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reacciones: {
        Row: {
          creado_en: string
          mensaje_id: string
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          mensaje_id: string
          usuario_id: string
        }
        Update: {
          creado_en?: string
          mensaje_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reacciones_mensaje_id_fkey"
            columns: ["mensaje_id"]
            isOneToOne: false
            referencedRelation: "mensajes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reacciones_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      registro_moderacion: {
        Row: {
          autor_id: string
          eliminado_en: string
          era_respuesta: boolean
          id: string
          moderador_id: string
          texto_eliminado: string
        }
        Insert: {
          autor_id: string
          eliminado_en?: string
          era_respuesta: boolean
          id?: string
          moderador_id: string
          texto_eliminado: string
        }
        Update: {
          autor_id?: string
          eliminado_en?: string
          era_respuesta?: boolean
          id?: string
          moderador_id?: string
          texto_eliminado?: string
        }
        Relationships: [
          {
            foreignKeyName: "registro_moderacion_autor_id_fkey"
            columns: ["autor_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registro_moderacion_moderador_id_fkey"
            columns: ["moderador_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      selecciones_comida: {
        Row: {
          actualizado_en: string
          comida: Database["public"]["Enums"]["tiempo_comida"]
          estado: Database["public"]["Enums"]["estado_comida"]
          fecha: string
          nota: string | null
          origen: Database["public"]["Enums"]["origen_seleccion"]
          usuario_id: string
        }
        Insert: {
          actualizado_en?: string
          comida: Database["public"]["Enums"]["tiempo_comida"]
          estado: Database["public"]["Enums"]["estado_comida"]
          fecha: string
          nota?: string | null
          origen: Database["public"]["Enums"]["origen_seleccion"]
          usuario_id: string
        }
        Update: {
          actualizado_en?: string
          comida?: Database["public"]["Enums"]["tiempo_comida"]
          estado?: Database["public"]["Enums"]["estado_comida"]
          fecha?: string
          nota?: string | null
          origen?: Database["public"]["Enums"]["origen_seleccion"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "selecciones_comida_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      comida_editable: {
        Args: {
          p_ahora?: string
          p_comida: Database["public"]["Enums"]["tiempo_comida"]
          p_fecha: string
        }
        Returns: boolean
      }
      comidas_sin_definir: {
        Args: {
          p_comida: Database["public"]["Enums"]["tiempo_comida"]
          p_fecha: string
        }
        Returns: string[]
      }
      guardar_seleccion: {
        Args: {
          p_comida: Database["public"]["Enums"]["tiempo_comida"]
          p_estado: Database["public"]["Enums"]["estado_comida"]
          p_fecha: string
          p_nota: string
        }
        Returns: undefined
      }
      mi_rol: { Args: never; Returns: Database["public"]["Enums"]["rol"] }
      nota_valida: {
        Args: {
          p_estado: Database["public"]["Enums"]["estado_comida"]
          p_nota: string
        }
        Returns: boolean
      }
      soy_activo: { Args: never; Returns: boolean }
      volver_a_plan: {
        Args: {
          p_comida: Database["public"]["Enums"]["tiempo_comida"]
          p_fecha: string
        }
        Returns: undefined
      }
      zona_horaria_app: { Args: never; Returns: string }
    }
    Enums: {
      estado_comida: "si" | "no" | "temprano" | "tarde" | "bolsa" | "enfermo"
      origen_seleccion: "persona" | "plan"
      rol: "director" | "residente" | "administracion"
      tiempo_comida: "desayuno" | "almuerzo" | "cena"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      estado_comida: ["si", "no", "temprano", "tarde", "bolsa", "enfermo"],
      origen_seleccion: ["persona", "plan"],
      rol: ["director", "residente", "administracion"],
      tiempo_comida: ["desayuno", "almuerzo", "cena"],
    },
  },
} as const

