import { vi } from 'vitest'
import type { Perfil, Rol } from '@/lib/auth/sesion'

export type Respuesta = { data: unknown; error: unknown }

/** Una consulta tal como la armó la acción: tabla, operación, valores y filtros. */
export type Operacion = {
  tabla: string
  operacion: 'select' | 'insert' | 'upsert' | 'update' | 'delete' | null
  valores?: unknown
  opciones?: unknown
  columnas?: string
  filtros: [string, unknown][]
}

/**
 * Cliente de Supabase falso para probar Server Actions sin base: registra cada consulta y cada RPC
 * y responde en orden con las respuestas dadas (si se acaban: sin filas y sin error).
 */
export function clienteSupabaseFalso(respuestas: { consultas?: Respuesta[]; rpc?: Respuesta[] } = {}) {
  const pendientesConsulta = [...(respuestas.consultas ?? [])]
  const pendientesRpc = [...(respuestas.rpc ?? [])]
  const operaciones: Operacion[] = []
  const rpcs: { nombre: string; args: unknown }[] = []

  function desde(tabla: string) {
    const op: Operacion = { tabla, operacion: null, filtros: [] }
    operaciones.push(op)
    const consulta = {
      select(columnas?: string) {
        op.operacion ??= 'select'
        op.columnas = columnas
        return consulta
      },
      insert(valores: unknown) {
        op.operacion = 'insert'
        op.valores = valores
        return consulta
      },
      upsert(valores: unknown, opciones?: unknown) {
        op.operacion = 'upsert'
        op.valores = valores
        op.opciones = opciones
        return consulta
      },
      update(valores: unknown) {
        op.operacion = 'update'
        op.valores = valores
        return consulta
      },
      delete() {
        op.operacion = 'delete'
        return consulta
      },
      eq(columna: string, valor: unknown) {
        op.filtros.push([columna, valor])
        return consulta
      },
      match(valores: Record<string, unknown>) {
        op.filtros.push(...Object.entries(valores))
        return consulta
      },
      /** Se registra como ['columna>=', valor]. */
      gte(columna: string, valor: unknown) {
        op.filtros.push([`${columna}>=`, valor])
        return consulta
      },
      /** Una sola fila: la próxima respuesta tal cual (si se acaban: null y sin error). */
      single() {
        return Promise.resolve(pendientesConsulta.shift() ?? { data: null, error: null })
      },
      maybeSingle() {
        return Promise.resolve(pendientesConsulta.shift() ?? { data: null, error: null })
      },
      then<T>(resolver: (r: Respuesta) => T, rechazar?: (motivo: unknown) => T) {
        return Promise.resolve(pendientesConsulta.shift() ?? { data: [], error: null }).then(resolver, rechazar)
      },
    }
    return consulta
  }

  const cliente = {
    from: vi.fn(desde),
    rpc: vi.fn(async (nombre: string, args: unknown) => {
      rpcs.push({ nombre, args })
      return pendientesRpc.shift() ?? { data: null, error: null }
    }),
  }
  return { cliente, operaciones, rpcs }
}

/** Perfil completo de prueba (la fila de `perfiles`). */
export function perfilDePrueba(id: string, rol: Rol): Perfil {
  return {
    id,
    nombre: `Persona ${rol}`,
    siglas: rol.slice(0, 2).toUpperCase(),
    usuario: `${rol}-${id.slice(0, 4)}`,
    correo: null,
    rol,
    activo: true,
    debe_cambiar_contrasena: false,
    avisar_hora_limite: true,
    avisar_cambios: true,
    avisar_cocina: true,
    avisar_mensajes: true,
    apariencia_tema: null,
    apariencia_contraste: null,
    apariencia_texto: null,
    creado_en: '2026-09-17T00:00:00Z',
  }
}
