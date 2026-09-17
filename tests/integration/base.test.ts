import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ZONA_HORARIA } from '@/lib/fechas'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteComo, type ClaveUsuario } from '../soporte/usuarios-prueba'

let ids: Record<ClaveUsuario, string>
const admin = clienteAdminPrueba()

beforeAll(async () => {
  ids = await asegurarUsuariosPrueba()
})

afterEach(async () => {
  await asegurarUsuariosPrueba()
  await admin.from('horas_limite').update({ dia_relativo: 0, hora: '10:00' }).eq('comida', 'almuerzo')
})

describe('zona horaria', () => {
  it('zona_horaria_app() coincide con lib/fechas', async () => {
    const residente = await clienteComo('residente')
    const { data, error } = await residente.rpc('zona_horaria_app')
    expect(error).toBeNull()
    expect(data).toBe(ZONA_HORARIA)
  })
})

describe('perfiles: RLS', () => {
  it('un usuario activo ve todos los perfiles', async () => {
    const residente = await clienteComo('residente')
    const { data, error } = await residente.from('perfiles').select('id')
    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThanOrEqual(5)
  })

  it('nadie puede modificar perfiles con su sesión', async () => {
    const director = await clienteComo('director')
    await director.from('perfiles').update({ nombre: 'Hackeado' }).eq('id', ids.residente)
    const { data } = await admin.from('perfiles').select('nombre').eq('id', ids.residente).single()
    expect(data!.nombre).toBe('Residente Prueba')
  })

  it('un usuario inactivo no ve ningún perfil', async () => {
    await admin.from('perfiles').update({ activo: false }).eq('id', ids.residente2)
    const inactivo = await clienteComo('residente2')
    const { data } = await inactivo.from('perfiles').select('id')
    expect(data).toEqual([])
  })
})

describe('horas_limite: RLS', () => {
  it('un residente no puede cambiarlas', async () => {
    const residente = await clienteComo('residente')
    await residente.from('horas_limite').update({ hora: '11:00' }).eq('comida', 'almuerzo')
    const { data } = await admin.from('horas_limite').select('hora').eq('comida', 'almuerzo').single()
    expect(data!.hora).toBe('10:00:00')
  })

  it('el Director puede cambiarlas', async () => {
    const director = await clienteComo('director')
    const { error } = await director.from('horas_limite').update({ hora: '11:00' }).eq('comida', 'almuerzo')
    expect(error).toBeNull()
    const { data } = await admin.from('horas_limite').select('hora').eq('comida', 'almuerzo').single()
    expect(data!.hora).toBe('11:00:00')
  })
})

describe('al menos un Director activo', () => {
  it('permite bajar a un Director si queda otro', async () => {
    const { error } = await admin.from('perfiles').update({ rol: 'residente' }).eq('id', ids.director2)
    expect(error).toBeNull()
  })

  it('rechaza dejar cero Directores activos (MOL02)', async () => {
    await admin.from('perfiles').update({ activo: false }).eq('id', ids.director2)
    const { error } = await admin.from('perfiles').update({ rol: 'residente' }).eq('id', ids.director)
    expect(error?.code).toBe('MOL02')
  })
})
