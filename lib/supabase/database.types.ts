export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14"
  }
  public: {
    Tables: {
      ausencias: {
        Row: {
          creado_en: string
          creado_por: string | null
          desde: string
          hasta: string
          id: string
          usuario_id: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por?: string | null
          desde: string
          hasta: string
          id?: string
          usuario_id: string
        }
        Update: {
          creado_en?: string
          creado_por?: string | null
          desde?: string
          hasta?: string
          id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ausencias_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
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
        ComputedFields: never
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
      avisos_mensaje_push: {
        Row: {
          mensaje_id: string
          reservado_en: string
          revision: number
          suscripcion_id: string
          tipo: string
        }
        ComputedFields: never
        Insert: {
          mensaje_id: string
          reservado_en?: string
          revision: number
          suscripcion_id: string
          tipo: string
        }
        Update: {
          mensaje_id?: string
          reservado_en?: string
          revision?: number
          suscripcion_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_mensaje_push_mensaje_id_fkey"
            columns: ["mensaje_id"]
            isOneToOne: false
            referencedRelation: "mensajes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avisos_mensaje_push_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones_push"
            referencedColumns: ["id"]
          },
        ]
      }
      avisos_pago_pension_push: {
        Row: {
          pago_id: string
          reservado_en: string
          suscripcion_id: string
        }
        ComputedFields: never
        Insert: {
          pago_id: string
          reservado_en?: string
          suscripcion_id: string
        }
        Update: {
          pago_id?: string
          reservado_en?: string
          suscripcion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avisos_pago_pension_push_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: false
            referencedRelation: "pensiones_pagos_push"
            referencedColumns: ["pago_id"]
          },
          {
            foreignKeyName: "avisos_pago_pension_push_suscripcion_id_fkey"
            columns: ["suscripcion_id"]
            isOneToOne: false
            referencedRelation: "suscripciones_push"
            referencedColumns: ["id"]
          },
        ]
      }
      comidas_cerradas: {
        Row: {
          cerrada_en: string
          comida: Database["public"]["Enums"]["tiempo_comida"]
          fecha: string
        }
        ComputedFields: never
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
      confirmaciones_extra: {
        Row: {
          cantidad_personas: number
          creado_en: string
          enlace_id: string
          id: string
          nombre: string
        }
        ComputedFields: never
        Insert: {
          cantidad_personas: number
          creado_en?: string
          enlace_id: string
          id?: string
          nombre: string
        }
        Update: {
          cantidad_personas?: number
          creado_en?: string
          enlace_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "confirmaciones_extra_enlace_id_fkey"
            columns: ["enlace_id"]
            isOneToOne: false
            referencedRelation: "enlaces_confirmacion"
            referencedColumns: ["id"]
          },
        ]
      }
      enlaces_confirmacion: {
        Row: {
          creado_en: string
          creado_por: string
          evento_id: string
          id: string
          tiempo_comida: Database["public"]["Enums"]["tiempo_comida"]
          token: string
          vence_en: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por: string
          evento_id: string
          id?: string
          tiempo_comida: Database["public"]["Enums"]["tiempo_comida"]
          token?: string
          vence_en: string
        }
        Update: {
          creado_en?: string
          creado_por?: string
          evento_id?: string
          id?: string
          tiempo_comida?: Database["public"]["Enums"]["tiempo_comida"]
          token?: string
          vence_en?: string
        }
        Relationships: [
          {
            foreignKeyName: "enlaces_confirmacion_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enlaces_confirmacion_evento_id_fkey"
            columns: ["evento_id"]
            isOneToOne: false
            referencedRelation: "eventos"
            referencedColumns: ["id"]
          },
        ]
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
          serie_id: string | null
          tipo: Database["public"]["Enums"]["tipo_evento"]
          titulo: string
        }
        ComputedFields: never
        Insert: {
          actualizado_en?: string
          creado_en?: string
          creado_por: string
          fecha: string
          hora?: string | null
          id?: string
          requiere_cocina?: Database["public"]["Enums"]["requerimiento_cocina"][]
          requiere_otro_texto?: string | null
          serie_id?: string | null
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
          serie_id?: string | null
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
          {
            foreignKeyName: "eventos_serie_id_fkey"
            columns: ["serie_id"]
            isOneToOne: false
            referencedRelation: "series_eventos"
            referencedColumns: ["id"]
          },
        ]
      }
      extras_manuales: {
        Row: {
          cantidad: number
          creado_en: string
          creado_por: string | null
          fecha: string
          id: string
          nota: string | null
          tiempo_comida: Database["public"]["Enums"]["tiempo_comida"]
        }
        ComputedFields: never
        Insert: {
          cantidad: number
          creado_en?: string
          creado_por?: string | null
          fecha: string
          id?: string
          nota?: string | null
          tiempo_comida: Database["public"]["Enums"]["tiempo_comida"]
        }
        Update: {
          cantidad?: number
          creado_en?: string
          creado_por?: string | null
          fecha?: string
          id?: string
          nota?: string | null
          tiempo_comida?: Database["public"]["Enums"]["tiempo_comida"]
        }
        Relationships: [
          {
            foreignKeyName: "extras_manuales_creado_por_fkey"
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
        ComputedFields: never
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
          aviso_revision: number
          creado_en: string
          estado: Database["public"]["Enums"]["estado_mensaje"]
          fijado_en: string | null
          fijado_hasta: string | null
          fijado_por: string | null
          id: string
          motivo_rechazo: string | null
          padre_id: string | null
          solo_director: boolean
          texto: string
        }
        ComputedFields: never
        Insert: {
          autor_id: string
          aviso_revision?: number
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_mensaje"]
          fijado_en?: string | null
          fijado_hasta?: string | null
          fijado_por?: string | null
          id?: string
          motivo_rechazo?: string | null
          padre_id?: string | null
          solo_director?: boolean
          texto: string
        }
        Update: {
          autor_id?: string
          aviso_revision?: number
          creado_en?: string
          estado?: Database["public"]["Enums"]["estado_mensaje"]
          fijado_en?: string | null
          fijado_hasta?: string | null
          fijado_por?: string | null
          id?: string
          motivo_rechazo?: string | null
          padre_id?: string | null
          solo_director?: boolean
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
            foreignKeyName: "mensajes_fijado_por_fkey"
            columns: ["fijado_por"]
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
      notas_dieta: {
        Row: {
          nota: string
          usuario_id: string
        }
        ComputedFields: never
        Insert: {
          nota: string
          usuario_id: string
        }
        Update: {
          nota?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notas_dieta_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pensiones_cuotas: {
        Row: {
          categoria: string
          desde: string
          modificado_en: string
          monto_centavos: number
          usuario_id: string
        }
        ComputedFields: never
        Insert: {
          categoria: string
          desde: string
          modificado_en?: string
          monto_centavos: number
          usuario_id: string
        }
        Update: {
          categoria?: string
          desde?: string
          modificado_en?: string
          monto_centavos?: number
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pensiones_cuotas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pensiones_donaciones_configuracion: {
        Row: {
          desde: string
          modificado_en: string
          modificado_por: string
          monto_centavos: number
        }
        ComputedFields: never
        Insert: {
          desde: string
          modificado_en?: string
          modificado_por: string
          monto_centavos: number
        }
        Update: {
          desde?: string
          modificado_en?: string
          modificado_por?: string
          monto_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "pensiones_donaciones_configuracion_modificado_por_fkey"
            columns: ["modificado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pensiones_donaciones_recepciones: {
        Row: {
          monto_centavos: number
          periodo: string
          recibido_en: string
          registrado_por: string
        }
        ComputedFields: never
        Insert: {
          monto_centavos: number
          periodo: string
          recibido_en?: string
          registrado_por: string
        }
        Update: {
          monto_centavos?: number
          periodo?: string
          recibido_en?: string
          registrado_por?: string
        }
        Relationships: [
          {
            foreignKeyName: "pensiones_donaciones_recepciones_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pensiones_exencion: {
        Row: {
          desde: string
          unica: boolean
          usuario_id: string
        }
        ComputedFields: never
        Insert: {
          desde?: string
          unica?: boolean
          usuario_id: string
        }
        Update: {
          desde?: string
          unica?: boolean
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pensiones_exencion_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: true
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pensiones_pagos: {
        Row: {
          abono_centavos: number
          categoria: string
          id: string
          monto_centavos: number
          periodo: string
          registrado_en: string
          registrado_por: string
          usuario_id: string
        }
        ComputedFields: never
        Insert: {
          abono_centavos: number
          categoria: string
          id?: string
          monto_centavos: number
          periodo: string
          registrado_en?: string
          registrado_por: string
          usuario_id: string
        }
        Update: {
          abono_centavos?: number
          categoria?: string
          id?: string
          monto_centavos?: number
          periodo?: string
          registrado_en?: string
          registrado_por?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pensiones_pagos_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pensiones_pagos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pensiones_pagos_push: {
        Row: {
          completado: boolean
          creado_en: string
          pago_id: string
        }
        ComputedFields: never
        Insert: {
          completado: boolean
          creado_en?: string
          pago_id: string
        }
        Update: {
          completado?: boolean
          creado_en?: string
          pago_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pensiones_pagos_push_pago_id_fkey"
            columns: ["pago_id"]
            isOneToOne: true
            referencedRelation: "pensiones_pagos"
            referencedColumns: ["id"]
          },
        ]
      }
      pensiones_participacion: {
        Row: {
          desde: string
          incluido: boolean
          usuario_id: string
        }
        ComputedFields: never
        Insert: {
          desde: string
          incluido: boolean
          usuario_id: string
        }
        Update: {
          desde?: string
          incluido?: boolean
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pensiones_participacion_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pensiones_reportes: {
        Row: {
          cargado_en: string
          cargado_por: string | null
          categoria: string
          id: string
          nombre: string
          ruta: string
          tamano: number
        }
        ComputedFields: never
        Insert: {
          cargado_en?: string
          cargado_por?: string | null
          categoria: string
          id: string
          nombre: string
          ruta: string
          tamano: number
        }
        Update: {
          cargado_en?: string
          cargado_por?: string | null
          categoria?: string
          id?: string
          nombre?: string
          ruta?: string
          tamano?: number
        }
        Relationships: [
          {
            foreignKeyName: "pensiones_reportes_cargado_por_fkey"
            columns: ["cargado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pensiones_reportes_limpieza: {
        Row: {
          creado_en: string
          ruta: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          ruta: string
        }
        Update: {
          creado_en?: string
          ruta?: string
        }
        Relationships: []
      }
      pensiones_reportes_reservas: {
        Row: {
          categoria: string
          creado_en: string
          id: string
          nombre: string
          ruta: string
          tamano: number
          usuario_id: string
        }
        ComputedFields: never
        Insert: {
          categoria: string
          creado_en?: string
          id?: string
          nombre: string
          ruta: string
          tamano: number
          usuario_id: string
        }
        Update: {
          categoria?: string
          creado_en?: string
          id?: string
          nombre?: string
          ruta?: string
          tamano?: number
          usuario_id?: string
        }
        Relationships: []
      }
      perfiles: {
        Row: {
          activo: boolean
          apariencia_contraste: string | null
          apariencia_tema: string | null
          apariencia_texto: string | null
          avisar_cambios: boolean
          avisar_cocina: boolean
          avisar_hora_limite: boolean
          avisar_mensajes: boolean
          avisar_pensiones: boolean
          correo: string | null
          creado_en: string
          debe_cambiar_contrasena: boolean
          fuera_de_conteos: boolean
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol"]
          siglas: string
          usuario: string
        }
        ComputedFields: never
        Insert: {
          activo?: boolean
          apariencia_contraste?: string | null
          apariencia_tema?: string | null
          apariencia_texto?: string | null
          avisar_cambios?: boolean
          avisar_cocina?: boolean
          avisar_hora_limite?: boolean
          avisar_mensajes?: boolean
          avisar_pensiones?: boolean
          correo?: string | null
          creado_en?: string
          debe_cambiar_contrasena?: boolean
          fuera_de_conteos?: boolean
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol"]
          siglas: string
          usuario: string
        }
        Update: {
          activo?: boolean
          apariencia_contraste?: string | null
          apariencia_tema?: string | null
          apariencia_texto?: string | null
          avisar_cambios?: boolean
          avisar_cocina?: boolean
          avisar_hora_limite?: boolean
          avisar_mensajes?: boolean
          avisar_pensiones?: boolean
          correo?: string | null
          creado_en?: string
          debe_cambiar_contrasena?: boolean
          fuera_de_conteos?: boolean
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol"]
          siglas?: string
          usuario?: string
        }
        Relationships: []
      }
      plan_semanal: {
        Row: {
          comida: Database["public"]["Enums"]["tiempo_comida"]
          dia_semana: number
          estado: Database["public"]["Enums"]["estado_comida"]
          modificado_por: string | null
          nota: string | null
          usuario_id: string
        }
        ComputedFields: never
        Insert: {
          comida: Database["public"]["Enums"]["tiempo_comida"]
          dia_semana: number
          estado: Database["public"]["Enums"]["estado_comida"]
          modificado_por?: string | null
          nota?: string | null
          usuario_id: string
        }
        Update: {
          comida?: Database["public"]["Enums"]["tiempo_comida"]
          dia_semana?: number
          estado?: Database["public"]["Enums"]["estado_comida"]
          modificado_por?: string | null
          nota?: string | null
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_semanal_modificado_por_fkey"
            columns: ["modificado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
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
        ComputedFields: never
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
        ComputedFields: never
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
          modificado_por: string | null
          nota: string | null
          origen: Database["public"]["Enums"]["origen_seleccion"]
          usuario_id: string
        }
        ComputedFields: never
        Insert: {
          actualizado_en?: string
          comida: Database["public"]["Enums"]["tiempo_comida"]
          estado: Database["public"]["Enums"]["estado_comida"]
          fecha: string
          modificado_por?: string | null
          nota?: string | null
          origen: Database["public"]["Enums"]["origen_seleccion"]
          usuario_id: string
        }
        Update: {
          actualizado_en?: string
          comida?: Database["public"]["Enums"]["tiempo_comida"]
          estado?: Database["public"]["Enums"]["estado_comida"]
          fecha?: string
          modificado_por?: string | null
          nota?: string | null
          origen?: Database["public"]["Enums"]["origen_seleccion"]
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "selecciones_comida_modificado_por_fkey"
            columns: ["modificado_por"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "selecciones_comida_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfiles"
            referencedColumns: ["id"]
          },
        ]
      }
      series_eventos: {
        Row: {
          creado_en: string
          creado_por: string
          dia_mes: number | null
          dia_semana: number | null
          fecha_fin: string
          fecha_inicio: string
          hora: string | null
          id: string
          ordinal_semana: number | null
          patron: Database["public"]["Enums"]["patron_recurrencia"]
          requiere_cocina: Database["public"]["Enums"]["requerimiento_cocina"][]
          requiere_otro_texto: string | null
          tipo: Database["public"]["Enums"]["tipo_evento"]
          titulo: string
        }
        ComputedFields: never
        Insert: {
          creado_en?: string
          creado_por: string
          dia_mes?: number | null
          dia_semana?: number | null
          fecha_fin: string
          fecha_inicio: string
          hora?: string | null
          id?: string
          ordinal_semana?: number | null
          patron: Database["public"]["Enums"]["patron_recurrencia"]
          requiere_cocina?: Database["public"]["Enums"]["requerimiento_cocina"][]
          requiere_otro_texto?: string | null
          tipo?: Database["public"]["Enums"]["tipo_evento"]
          titulo: string
        }
        Update: {
          creado_en?: string
          creado_por?: string
          dia_mes?: number | null
          dia_semana?: number | null
          fecha_fin?: string
          fecha_inicio?: string
          hora?: string | null
          id?: string
          ordinal_semana?: number | null
          patron?: Database["public"]["Enums"]["patron_recurrencia"]
          requiere_cocina?: Database["public"]["Enums"]["requerimiento_cocina"][]
          requiere_otro_texto?: string | null
          tipo?: Database["public"]["Enums"]["tipo_evento"]
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_eventos_creado_por_fkey"
            columns: ["creado_por"]
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
        ComputedFields: never
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
      abandonar_reporte_pension: { Args: { p_id: string }; Returns: undefined }
      activar_exencion_pension: {
        Args: { p_usuario_id: string }
        Returns: string
      }
      ausentes_en: { Args: { p_fecha: string }; Returns: string[] }
      aviso_pago_pension: {
        Args: { p_pago_id: string }
        Returns: {
          abono_centavos: number
          completado: boolean
          periodo: string
          siglas: string
        }[]
      }
      comida_editable: {
        Args: {
          p_ahora?: string
          p_comida: Database["public"]["Enums"]["tiempo_comida"]
          p_fecha: string
        }
        Returns: boolean
      }
      comida_sin_cerrar: {
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
      confirmar_cena_extra: {
        Args: { p_cantidad: number; p_nombre: string; p_token: string }
        Returns: undefined
      }
      congelar_comidas_de: {
        Args: {
          p_comida?: Database["public"]["Enums"]["tiempo_comida"]
          p_desde: string
          p_dia_semana?: number
          p_hasta: string
          p_usuario: string
        }
        Returns: undefined
      }
      crear_serie_eventos: {
        Args: {
          p_dia_mes: number
          p_dia_semana: number
          p_fecha_fin: string
          p_fecha_inicio: string
          p_fechas: string[]
          p_hora: string
          p_ordinal_semana: number
          p_patron: Database["public"]["Enums"]["patron_recurrencia"]
          p_requiere_cocina: Database["public"]["Enums"]["requerimiento_cocina"][]
          p_requiere_otro_texto: string
          p_tipo: Database["public"]["Enums"]["tipo_evento"]
          p_titulo: string
        }
        Returns: string
      }
      desfijar_mensaje: { Args: { p_id: string }; Returns: undefined }
      donaciones_pensiones: {
        Args: { p_anio: number }
        Returns: {
          monto_centavos: number
          periodo: string
          recibido_en: string
          registrado_por: string
        }[]
      }
      eliminar_reporte_pension: { Args: { p_id: string }; Returns: undefined }
      eventos_para_cocina: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          fecha: string
          hora: string
          id: string
          requiere_cocina: Database["public"]["Enums"]["requerimiento_cocina"][]
          requiere_otro_texto: string
          tipo: Database["public"]["Enums"]["tipo_evento"]
          titulo: string
        }[]
      }
      extras_de_la_semana: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          fecha: string
          tiempo_comida: Database["public"]["Enums"]["tiempo_comida"]
          total: number
        }[]
      }
      extras_manuales_de_la_semana: {
        Args: { p_desde: string; p_hasta: string }
        Returns: {
          cantidad: number
          fecha: string
          id: string
          nota: string
          tiempo_comida: Database["public"]["Enums"]["tiempo_comida"]
        }[]
      }
      fijar_mensaje: {
        Args: { p_hasta: string; p_id: string }
        Returns: string
      }
      finalizar_reporte_pension: { Args: { p_id: string }; Returns: string }
      guardar_cuota_pension: {
        Args: {
          p_categoria: string
          p_desde: string
          p_monto_centavos: number
          p_usuario_id: string
        }
        Returns: undefined
      }
      guardar_donacion_pension: {
        Args: { p_desde: string; p_monto_centavos: number }
        Returns: undefined
      }
      guardar_nota_dieta_de: {
        Args: { p_nota: string; p_usuario: string }
        Returns: undefined
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
      guardar_seleccion_de: {
        Args: {
          p_comida: Database["public"]["Enums"]["tiempo_comida"]
          p_estado: Database["public"]["Enums"]["estado_comida"]
          p_fecha: string
          p_nota: string
          p_usuario: string
        }
        Returns: undefined
      }
      info_enlace_confirmacion: {
        Args: { p_token: string }
        Returns: {
          evento_titulo: string
          fecha: string
          hora: string
          tiempo_comida: Database["public"]["Enums"]["tiempo_comida"]
          vence_en: string
          vigente: boolean
        }[]
      }
      llamar_limpieza_reportes_pension: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      llamar_recordatorios: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      marcar_pensiones: {
        Args: {
          p_abonos?: number[]
          p_montos_esperados?: number[]
          p_pagados_esperados?: number[]
          p_periodos: string[]
        }
        Returns: {
          abono_centavos: number
          categoria: string
          id: string
          monto_centavos: number
          periodo: string
          registrado_en: string
          registrado_por: string
          usuario_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pensiones_pagos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      marcar_pensiones_con_movimientos: {
        Args: {
          p_abonos?: number[]
          p_montos_esperados?: number[]
          p_pagados_esperados?: number[]
          p_periodos: string[]
        }
        Returns: {
          pago_id: string
        }[]
      }
      marcar_pensiones_de_con_movimientos: {
        Args: {
          p_abonos?: number[]
          p_montos_esperados: number[]
          p_pagados_esperados?: number[]
          p_periodos: string[]
          p_usuario_id: string
        }
        Returns: {
          pago_id: string
        }[]
      }
      mes_actual_pensiones: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      mi_rol: {
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["rol"]
      }
      mis_pensiones: {
        Args: { p_anio: number }
        Returns: {
          categoria: string
          exento: boolean
          monto_centavos: number
          pagado_centavos: number
          periodo: string
          registrado_en: string
        }[]
      }
      nota_valida: {
        Args: {
          p_estado: Database["public"]["Enums"]["estado_comida"]
          p_nota: string
        }
        Returns: boolean
      }
      pensiones_de: {
        Args: { p_anio: number; p_usuario_id: string }
        Returns: {
          categoria: string
          exento: boolean
          monto_centavos: number
          pagado_centavos: number
          periodo: string
          registrado_en: string
        }[]
      }
      pensiones_es_exento: {
        Args: { p_periodo: string; p_usuario_id: string }
        Returns: boolean
      }
      preparar_limpieza_reportes_pension: {
        Args: Record<PropertyKey, never>
        Returns: {
          ruta: string
        }[]
      }
      presupuesto_pensiones: {
        Args: { p_periodo: string }
        Returns: {
          categoria: string
          concepto: string
          etiqueta: string
          exento: boolean
          monto_centavos: number
          pagado_centavos: number
          registrado_en: string
          usuario_id: string
        }[]
      }
      puedo_gestionar_comidas_de: {
        Args: { p_usuario: string }
        Returns: boolean
      }
      puedo_leer_mensaje: { Args: { p_id: string }; Returns: boolean }
      recibir_donacion_pension: {
        Args: { p_monto_esperado: number; p_periodo: string }
        Returns: {
          monto_centavos: number
          nueva: boolean
          periodo: string
          recibido_en: string
          registrado_por: string
        }[]
      }
      registrar_abonos_pension: {
        Args: {
          p_abonos: number[]
          p_de_la_casa: boolean
          p_montos_esperados: number[]
          p_pagados_esperados: number[]
          p_periodos: string[]
          p_usuario_id: string
        }
        Returns: {
          abono_centavos: number
          categoria: string
          id: string
          monto_centavos: number
          periodo: string
          registrado_en: string
          registrado_por: string
          usuario_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "pensiones_pagos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      requiere_cocina_valido: {
        Args: { p: Database["public"]["Enums"]["requerimiento_cocina"][] }
        Returns: boolean
      }
      reservar_avisos_mensaje: {
        Args: {
          p_mensaje_id: string
          p_revision: number
          p_suscripciones: string[]
          p_tipo: string
        }
        Returns: string[]
      }
      reservar_avisos_pago_pension: {
        Args: { p_pago_id: string; p_suscripciones: string[] }
        Returns: string[]
      }
      reservar_reporte_pension: {
        Args: { p_categoria: string; p_nombre: string; p_tamano: number }
        Returns: {
          id: string
          ruta: string
        }[]
      }
      soy_activo: { Args: Record<PropertyKey, never>; Returns: boolean }
      tiene_comidas: { Args: { p_usuario: string }; Returns: boolean }
      validar_titular_pension: {
        Args: { p_de_la_casa: boolean; p_usuario_id: string }
        Returns: undefined
      }
      valores_pension: {
        Args: { p_periodo: string; p_usuario_id: string }
        Returns: {
          categoria: string
          monto_centavos: number
          pagado_centavos: number
          registrado_en: string
        }[]
      }
      volver_a_plan: {
        Args: {
          p_comida: Database["public"]["Enums"]["tiempo_comida"]
          p_fecha: string
        }
        Returns: undefined
      }
      volver_a_plan_de: {
        Args: {
          p_comida: Database["public"]["Enums"]["tiempo_comida"]
          p_fecha: string
          p_usuario: string
        }
        Returns: undefined
      }
      zona_horaria_app: { Args: Record<PropertyKey, never>; Returns: string }
    }
    Enums: {
      estado_comida:
        | "si"
        | "no"
        | "temprano"
        | "tarde"
        | "bolsa"
        | "lonchera"
        | "enfermo"
      estado_mensaje: "pendiente" | "aprobado" | "rechazado"
      origen_seleccion: "persona" | "plan" | "ausencia"
      patron_recurrencia:
        | "semanal"
        | "mensual_dia_fijo"
        | "mensual_dia_semana"
        | "anual"
      requerimiento_cocina: "merienda" | "comida" | "materiales"
      rol: "director" | "residente" | "administracion" | "administradora"
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
      estado_comida: [
        "si",
        "no",
        "temprano",
        "tarde",
        "bolsa",
        "lonchera",
        "enfermo",
      ],
      estado_mensaje: ["pendiente", "aprobado", "rechazado"],
      origen_seleccion: ["persona", "plan", "ausencia"],
      patron_recurrencia: [
        "semanal",
        "mensual_dia_fijo",
        "mensual_dia_semana",
        "anual",
      ],
      requerimiento_cocina: ["merienda", "comida", "materiales"],
      rol: ["director", "residente", "administracion", "administradora"],
      tiempo_comida: ["desayuno", "almuerzo", "cena"],
      tipo_evento: ["san_rafael", "san_gabriel", "san_miguel", "otro"],
    },
  },
} as const
