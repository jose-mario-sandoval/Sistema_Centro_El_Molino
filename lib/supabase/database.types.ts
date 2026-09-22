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
      ausencias: {
        Row: {
          creado_en: string
          desde: string
          hasta: string
          id: string
          usuario_id: string
        }
        Insert: {
          creado_en?: string
          desde: string
          hasta: string
          id?: string
          usuario_id: string
        }
        Update: {
          creado_en?: string
          desde?: string
          hasta?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ausencias_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos_enviados: {
        Row: {
          comida: Database["public"]["Enums"]["tiempo_comida"]
          enviado_en: string
          fecha: string
        }
        Insert: {
          comida: Database["public"]["Enums"]["tiempo_comida"]
          enviado_en?: string
          fecha: string
        }
        Update: {
          comida?: Database["public"]["Enums"]["tiempo_comida"]
          enviado_en?: string
          fecha?: string
        }
        Relationships: []
      }
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
          requiere_cocina: Database["public"]["Enums"]["requerimiento_cocina"][]
          requiere_otro_texto: string | null
          tipo: Database["public"]["Enums"]["tipo_evento"]
          titulo: string
        }
        Insert: {
          actualizado_en?: string
          creado_en?: string
          creado_por: string
          fecha: string
          hora?: string | null
          id?: string
          requiere_cocina?: Database["public"]["Enums"]["requerimiento_cocina"][]
          requiere_otro_texto?: string | null
          tipo?: Database["public"]["Enums"]["tipo_evento"]
          titulo: string
        }
        Update: {
          actualizado_en?: string
          creado_en?: string
          creado_por?: string
          fecha?: string
          hora?: string | null
          id?: string
          requiere_cocina?: Database["public"]["Enums"]["requerimiento_cocina"][]
          requiere_otro_texto?: string | null
          tipo?: Database["public"]["Enums"]["tipo_evento"]
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
          estado: Database["public"]["Enums"]["estado_mensaje"]
          id: string
          motivo_rechazo: string | null
          padre_id: string | null
          texto: string
        }
        Insert: {
          autor_id: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_mensaje"]
          id?: string
          motivo_rechazo?: string | null
          padre_id?: string | null
          texto: string
        }
        Update: {
          autor_id?: string
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_mensaje"]
          id?: string
          motivo_rechazo?: string | null
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
          apariencia_contraste: string | null
          apariencia_tema: string | null
          apariencia_texto: string | null
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
          apariencia_contraste?: string | null
          apariencia_tema?: string | null
          apariencia_texto?: string | null
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
          apariencia_contraste?: string | null
          apariencia_tema?: string | null
          apariencia_texto?: string | null
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
      suscripciones_push: {
        Row: {
          auth: string
          creado_en: string
          endpoint: string
          id: string
          p256dh: string
          usuario_id: string
        }
        Insert: {
          auth: string
          creado_en?: string
          endpoint: string
          id?: string
          p256dh: string
          usuario_id: string
        }
        Update: {
          auth?: string
          creado_en?: string
          endpoint?: string
          id?: string
          p256dh?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suscripciones_push_usuario_id_fkey"
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
      ausentes_en: { Args: { p_fecha: string }; Returns: string[] }
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
      congelar_comidas_de: {
        Args: { p_desde: string; p_hasta: string; p_usuario: string }
        Returns: undefined
      }
      eventos_para_cocina: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          fecha: string
          hora: string
          id: string
          requiere_cocina: Database["public"]["Enums"]["requerimiento_cocina"][]
          requiere_otro_texto: string
        }[]
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
      llamar_recordatorios: { Args: never; Returns: number }
      mi_rol: { Args: never; Returns: Database["public"]["Enums"]["rol"] }
      nota_valida: {
        Args: {
          p_estado: Database["public"]["Enums"]["estado_comida"]
          p_nota: string
        }
        Returns: boolean
      }
      requiere_cocina_valido: {
        Args: { p: Database["public"]["Enums"]["requerimiento_cocina"][] }
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
      estado_mensaje: "pendiente" | "aprobado" | "rechazado"
      origen_seleccion: "persona" | "plan" | "ausencia"
      requerimiento_cocina: "merienda" | "comida" | "materiales"
      rol: "director" | "residente" | "administracion"
      tiempo_comida: "desayuno" | "almuerzo" | "cena"
      tipo_evento: "san_rafael" | "san_gabriel" | "san_miguel" | "otro"
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
      estado_mensaje: ["pendiente", "aprobado", "rechazado"],
      origen_seleccion: ["persona", "plan", "ausencia"],
      requerimiento_cocina: ["merienda", "comida", "materiales"],
      rol: ["director", "residente", "administracion"],
      tiempo_comida: ["desayuno", "almuerzo", "cena"],
      tipo_evento: ["san_rafael", "san_gabriel", "san_miguel", "otro"],
    },
  },
} as const

