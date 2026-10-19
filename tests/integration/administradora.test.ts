import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { fechaISOEn, sumarDias } from '@/lib/fechas'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

// Solo en CI con Supabase temporal: clienteAdminPrueba aplica exigirBaseLocal().
const admin = clienteAdminPrueba()
const fecha = sumarDias(fechaISOEn(new Date()), 7)
let ids: Record<ClaveUsuario, string>

beforeAll(async () => { ids = await asegurarUsuariosPrueba() })
afterEach(async () => {
  const usuarios = Object.values(ids)
  for (const tabla of ['mensajes', 'eventos'] as const) {
    const autor = tabla === 'mensajes' ? 'autor_id' : 'creado_por'
    const { error } = await admin.from(tabla).delete().in(autor, usuarios)
    if (error) throw error
  }
  // Los triggers de ausencias y planes pueden congelar comidas: selecciones van al final.
  for (const tabla of ['ausencias', 'plan_semanal', 'notas_dieta', 'selecciones_comida'] as const) {
    const { error } = await admin.from(tabla).delete().in('usuario_id', usuarios)
    if (error) throw error
  }
})

describe('Administradora hereda RLS de las funciones existentes sin atribuciones de Director', () => {
  it('consulta plan y dieta ajenos pero no tiene plan, notas ni ausencias propias', async () => {
    const director = await clienteComo('director')
    expect((await director.rpc('guardar_nota_dieta_de', { p_usuario: ids.residente, p_nota: 'Sin sal' })).error).toBeNull()
    expect((await admin.from('plan_semanal').insert({ usuario_id: ids.residente, dia_semana: 1, comida: 'cena', estado: 'si' })).error).toBeNull()
    expect((await admin.from('ausencias').insert({ usuario_id: ids.residente, desde: fecha, hasta: fecha })).error).toBeNull()
    const administradora = await clienteComo('administradora')
    expect((await administradora.from('plan_semanal').select('estado').eq('usuario_id', ids.residente)).data).toEqual([{ estado: 'si' }])
    expect((await administradora.from('notas_dieta').select('nota').eq('usuario_id', ids.residente)).data).toEqual([{ nota: 'Sin sal' }])
    expect((await administradora.from('ausencias').select('usuario_id')).data).toEqual([])
    expect((await administradora.from('plan_semanal').insert({ usuario_id: ids.administradora, dia_semana: 1, comida: 'cena', estado: 'si' })).error?.code).toBe('42501')
    expect((await administradora.rpc('guardar_nota_dieta_de', { p_usuario: ids.administradora, p_nota: 'No permitida' })).error?.code).toBe('42501')
    expect((await administradora.from('ausencias').insert({ usuario_id: ids.administradora, desde: fecha, hasta: fecha })).error?.code).toBe('42501')
  })

  it('solo lee pedidos de eventos por la RPC de cocina y no puede crearlos', async () => {
    expect((await admin.from('eventos').insert([
      { titulo: 'Con pedido', fecha, requiere_otro_texto: 'Preparar café', creado_por: ids.director },
      { titulo: 'Sin pedido', fecha, requiere_otro_texto: null, creado_por: ids.director },
    ])).error).toBeNull()
    const administradora = await clienteComo('administradora')
    expect((await administradora.from('eventos').select('titulo')).data).toEqual([])
    const pedidos = await administradora.rpc('eventos_para_cocina', { p_desde: fecha, p_hasta: fecha })
    expect(pedidos.error).toBeNull()
    expect(pedidos.data).toEqual([expect.objectContaining({ titulo: 'Con pedido', requiere_otro_texto: 'Preparar café' })])
    expect(JSON.stringify(pedidos.data)).not.toContain('Sin pedido')
    expect((await administradora.from('eventos').insert({ titulo: 'No permitido', fecha, creado_por: ids.administradora })).error?.code).toBe('42501')
  })

  it('publica aprobado, lee y reacciona en privados y fija publicaciones', async () => {
    const administradora = await clienteComo('administradora')
    const publicacion = await administradora.from('mensajes').insert({ autor_id: ids.administradora, texto: 'Aviso de Administradora', solo_director: true }).select('id, estado').single()
    expect(publicacion.error).toBeNull()
    if (!publicacion.data) throw new Error('No se creó la publicación de prueba')
    expect(publicacion.data.estado).toBe('aprobado')
    expect((await administradora.rpc('fijar_mensaje', { p_id: publicacion.data.id, p_hasta: null })).error).toBeNull()
    expect((await administradora.from('reacciones').insert({ mensaje_id: publicacion.data.id, usuario_id: ids.administradora })).error).toBeNull()
    const director = await clienteComo('director')
    const privado = await director.from('mensajes').insert({ autor_id: ids.director, texto: 'Privado para cocina', solo_director: true }).select('id').single()
    expect(privado.error).toBeNull()
    if (!privado.data) throw new Error('No se creó el mensaje privado de prueba')
    expect((await administradora.from('mensajes').select('texto').eq('id', privado.data.id)).data).toEqual([{ texto: 'Privado para cocina' }])
    const residente = await clienteComo('residente')
    expect((await residente.from('mensajes').select('id').eq('id', privado.data.id)).data).toEqual([])
    expect((await administradora.rpc('desfijar_mensaje', { p_id: publicacion.data.id })).error).toBeNull()
  })

  it('no ve mensajes pendientes ni obtiene facultades de moderación', async () => {
    const residente = await clienteComo('residente')
    const mensaje = await residente.from('mensajes').insert({ autor_id: ids.residente, texto: 'Pendiente de revisar' }).select('id').single()
    expect(mensaje.error).toBeNull()
    if (!mensaje.data) throw new Error('No se creó el mensaje pendiente de prueba')
    const administradora = await clienteComo('administradora')
    expect((await administradora.from('mensajes').select('id').eq('id', mensaje.data.id)).data).toEqual([])
    await administradora.from('mensajes').update({ estado: 'aprobado' }).eq('id', mensaje.data.id)
    expect((await admin.from('mensajes').select('estado').eq('id', mensaje.data.id).single()).data).toEqual({ estado: 'pendiente' })
    expect((await administradora.from('registro_moderacion').select('id')).data).toEqual([])
  })
})
