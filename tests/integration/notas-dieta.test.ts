import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteAnonimoPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

const admin = clienteAdminPrueba()
let ids: Record<ClaveUsuario, string>
beforeAll(async () => { ids = await asegurarUsuariosPrueba() })
afterEach(async () => {
  const notas = await admin.from('notas_dieta').delete().in('usuario_id', Object.values(ids))
  if (notas.error) throw notas.error
  const planes = await admin.from('plan_semanal').delete().eq('usuario_id', ids.residente)
  if (planes.error) throw planes.error
  await asegurarUsuariosPrueba()
})

describe('notas generales de dieta: persistencia y RLS', () => {
  it('la persona crea, edita y elimina; cambiar o borrar el plan no elimina su nota', async () => {
    const persona = await clienteComo('residente')
    expect((await persona.rpc('guardar_nota_dieta_de', { p_usuario: ids.residente, p_nota: '  Indicación general  ' })).error).toBeNull()
    expect((await persona.from('notas_dieta').select('nota').eq('usuario_id', ids.residente)).data).toEqual([{ nota: 'Indicación general' }])
    expect((await persona.from('plan_semanal').upsert({ usuario_id: ids.residente, dia_semana: 3, comida: 'almuerzo', estado: 'no' })).error).toBeNull()
    expect((await persona.from('plan_semanal').delete().eq('usuario_id', ids.residente)).error).toBeNull()
    const nuevaSesion = await clienteComo('residente')
    expect((await nuevaSesion.from('notas_dieta').select('nota').eq('usuario_id', ids.residente)).data).toEqual([{ nota: 'Indicación general' }])
    expect((await persona.rpc('guardar_nota_dieta_de', { p_usuario: ids.residente, p_nota: 'Actualizada' })).error).toBeNull()
    expect((await persona.from('notas_dieta').select('nota').eq('usuario_id', ids.residente)).data).toEqual([{ nota: 'Actualizada' }])
    expect((await persona.rpc('guardar_nota_dieta_de', { p_usuario: ids.residente, p_nota: '' })).error).toBeNull()
    expect((await persona.from('notas_dieta').select('nota').eq('usuario_id', ids.residente)).data).toEqual([])
    expect((await persona.rpc('guardar_nota_dieta_de', { p_usuario: ids.residente, p_nota: null })).error).toBeNull()
  })

  it('Director gestiona notas ajenas; Administración consulta y otro Residente no las lee ni cambia', async () => {
    const director = await clienteComo('director')
    expect((await director.rpc('guardar_nota_dieta_de', { p_usuario: ids.residente, p_nota: 'Indicación general' })).error).toBeNull()
    const cocina = await clienteComo('administracion')
    expect((await cocina.from('notas_dieta').select('nota').eq('usuario_id', ids.residente)).data).toEqual([{ nota: 'Indicación general' }])
    expect((await cocina.rpc('guardar_nota_dieta_de', { p_usuario: ids.residente, p_nota: 'Cambio' })).error?.code).toBe('42501')
    const otra = await clienteComo('residente2')
    expect((await otra.from('notas_dieta').select('nota').eq('usuario_id', ids.residente)).data).toEqual([])
    expect((await otra.rpc('guardar_nota_dieta_de', { p_usuario: ids.residente, p_nota: 'Cambio' })).error?.code).toBe('42501')
    // Tampoco es posible saltarse la RPC escribiendo directo por PostgREST.
    expect((await otra.from('notas_dieta').upsert({ usuario_id: ids.residente, nota: 'Cambio' })).error).not.toBeNull()
    expect((await cocina.from('notas_dieta').update({ nota: 'Cambio' }).eq('usuario_id', ids.residente).select('nota')).data).toEqual([])
    expect((await cocina.from('notas_dieta').delete().eq('usuario_id', ids.residente).select('nota')).data).toEqual([])
    expect((await director.from('notas_dieta').select('nota').eq('usuario_id', ids.residente)).data).toEqual([{ nota: 'Indicación general' }])
  })

  it('no permite notas propias de Administración, notas de inactivos ni lecturas anónimas', async () => {
    const director = await clienteComo('director')
    expect((await director.rpc('guardar_nota_dieta_de', { p_usuario: ids.administracion, p_nota: 'Indicación' })).error?.code).toBe('42501')
    await director.rpc('guardar_nota_dieta_de', { p_usuario: ids.residente, p_nota: 'Indicación' })
    await admin.from('perfiles').update({ activo: false }).eq('id', ids.residente)
    expect((await director.rpc('guardar_nota_dieta_de', { p_usuario: ids.residente, p_nota: 'Cambio' })).error?.code).toBe('42501')
    const cocina = await clienteComo('administracion')
    expect((await cocina.from('notas_dieta').select('nota').eq('usuario_id', ids.residente)).data).toEqual([])
    const anon = await clienteAnonimoPrueba().from('notas_dieta').select('nota')
    expect(anon.error).not.toBeNull()
  })

  it('la base rechaza notas demasiado largas aunque no se use el formulario', async () => {
    const persona = await clienteComo('residente')
    expect((await persona.rpc('guardar_nota_dieta_de', { p_usuario: ids.residente, p_nota: 'x'.repeat(1001) })).error?.code).toBe('23514')
    expect((await persona.from('notas_dieta').insert({ usuario_id: ids.residente, nota: '' })).error?.code).toBe('23514')
  })
})
