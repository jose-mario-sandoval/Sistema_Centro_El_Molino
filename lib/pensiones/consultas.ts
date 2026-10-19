import 'server-only'
import { exigirRol } from '@/lib/auth/sesion'
import { listarPerfiles } from '@/lib/perfiles/consultas'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { ROLES_PAGO, ROLES_PRESUPUESTO } from './permisos'
import type { FilaPresupuesto, MesPension, PagoPension } from './tipos'
import { leerPaginasPensiones } from './paginacion'

export async function obtenerMisPensiones(anio: number): Promise<MesPension[]> {
  await exigirRol(...ROLES_PAGO)
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.rpc('mis_pensiones', { p_anio: anio })
  if (error) throw error
  return data
}

export async function obtenerHistorialPropio(): Promise<PagoPension[]> {
  const perfil = await exigirRol(...ROLES_PAGO)
  const supabase = await crearClienteServidor()
  // El Director puede leer más filas por RLS: se filtra siempre por la identidad de sesión.
  return leerPaginasPensiones((desde, hasta) => supabase.from('pensiones_pagos')
    .select('periodo, categoria, monto_centavos, registrado_en')
    .eq('usuario_id', perfil.id).order('periodo', { ascending: false }).range(desde, hasta))
}

export async function obtenerPresupuesto(periodo: string): Promise<FilaPresupuesto[]> {
  await exigirRol(...ROLES_PRESUPUESTO)
  const supabase = await crearClienteServidor()
  // La RPC aplica la visibilidad también en SQL: Administradora recibe solamente siglas.
  const data = await leerPaginasPensiones((desde, hasta) => supabase.rpc('presupuesto_pensiones', { p_periodo: periodo })
    .order('etiqueta').order('usuario_id').range(desde, hasta))
  return data.map((fila) => ({ ...fila, periodo }))
}

export async function obtenerConfiguraciones() {
  await exigirRol('director')
  const supabase = await crearClienteServidor()
  const [personas, cuotas] = await Promise.all([
    listarPerfiles({ soloActivos: true, roles: ROLES_PAGO }),
    leerPaginasPensiones((desde, hasta) => supabase.from('pensiones_cuotas')
      .select('usuario_id, desde, categoria, monto_centavos').order('desde', { ascending: false }).order('usuario_id').range(desde, hasta)),
  ])
  return personas.map((persona) => ({ ...persona, cuotas: cuotas.filter((c) => c.usuario_id === persona.id) }))
}
