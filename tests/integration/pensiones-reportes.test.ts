import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BUCKET_REPORTES } from '@/lib/pensiones/reportes'
import { asegurarUsuariosPrueba, clienteAdminPrueba, clienteAnonimoPrueba, clienteComo } from '../soporte/usuarios-prueba'

// Este cliente aborta fuera de Supabase local. El proyecto de integración sólo corre en CI.
const admin = clienteAdminPrueba()
const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n')
let administradora: Awaited<ReturnType<typeof clienteComo>>
const rutasCreadas: string[] = []
const reservasCreadas: string[] = []

async function reservar(categoria: 'finanzas' | 'otras_utilidades', nombre = 'reporte.pdf') {
  const { data, error } = await administradora.rpc('reservar_reporte_pension', { p_categoria: categoria, p_nombre: nombre, p_tamano: pdf.length })
  expect(error).toBeNull()
  expect(data).toHaveLength(1)
  reservasCreadas.push(data[0].id)
  rutasCreadas.push(data[0].ruta)
  return data[0] as { id: string; ruta: string }
}

async function cargar(categoria: 'finanzas' | 'otras_utilidades') {
  const reserva = await reservar(categoria)
  const carga = await admin.storage.from(BUCKET_REPORTES).upload(reserva.ruta, pdf, { contentType: 'application/pdf', upsert: false })
  expect(carga.error).toBeNull()
  const finalizado = await administradora.rpc('finalizar_reporte_pension', { p_id: reserva.id })
  expect(finalizado.error).toBeNull()
  return reserva
}

async function listado() {
  const { data, error } = await administradora.from('pensiones_reportes').select('id, categoria, ruta')
  expect(error).toBeNull()
  return data! as { id: string; categoria: string; ruta: string }[]
}

beforeAll(async () => {
  await asegurarUsuariosPrueba()
  administradora = await clienteComo('administradora')
})

afterAll(async () => {
  // UUID/rutas propios para no tocar documentos de otras suites, aun en la base efímera.
  if (rutasCreadas.length) await admin.storage.from(BUCKET_REPORTES).remove(rutasCreadas)
  for (const id of reservasCreadas) {
    await admin.from('pensiones_reportes').delete().eq('id', id)
    await admin.from('pensiones_reportes_reservas').delete().eq('id', id)
  }
  for (const ruta of rutasCreadas) await admin.from('pensiones_reportes_limpieza').delete().eq('ruta', ruta)
})

describe('reportes privados de Pensiones', () => {
  it('sólo Administradora reserva/finaliza; Director consulta; los otros roles no leen', async () => {
    const documento = await cargar('finanzas')
    const director = await clienteComo('director')
    const lecturaDirector = await director.from('pensiones_reportes').select('id').eq('id', documento.id)
    expect(lecturaDirector.error).toBeNull()
    expect(lecturaDirector.data).toHaveLength(1)
    for (const clave of ['director', 'residente', 'administracion'] as const) {
      const cliente = await clienteComo(clave)
      const reserva = await cliente.rpc('reservar_reporte_pension', { p_categoria: 'finanzas', p_nombre: 'ilegal.pdf', p_tamano: pdf.length })
      expect(reserva.error?.code).toBe('42501')
      const finalizacion = await cliente.rpc('finalizar_reporte_pension', { p_id: documento.id })
      expect(finalizacion.error?.code).toBe('42501')
      const cancelacion = await cliente.rpc('abandonar_reporte_pension', { p_id: documento.id })
      expect(cancelacion.error?.code).toBe('42501')
      if (clave !== 'director') {
        const lectura = await cliente.from('pensiones_reportes').select('id')
        expect(lectura.data).toEqual([])
      }
      const escrituraDirecta = await cliente.from('pensiones_reportes').delete().eq('id', documento.id)
      expect(escrituraDirecta.error).not.toBeNull()
    }
    // Conocer la ruta no concede acceso. Ni la Administradora accede a Storage directamente:
    // sube/descarga por el servidor, donde se vuelve a comprobar la sesión y el archivo.
    for (const cliente of [administradora, director, await clienteComo('residente'), await clienteComo('administracion'), clienteAnonimoPrueba()]) {
      expect((await cliente.storage.from(BUCKET_REPORTES).download(documento.ruta)).error).not.toBeNull()
      expect((await cliente.storage.from(BUCKET_REPORTES).createSignedUrl(documento.ruta, 60)).error).not.toBeNull()
    }
  })

  it('si falla la nueva carga no elimina ninguno de los documentos anteriores', async () => {
    const existentes = await listado()
    for (let cantidad = existentes.filter((r) => r.categoria === 'finanzas').length; cantidad < 12; cantidad++) {
      await cargar('finanzas')
    }
    const antes = await listado()
    const pendiente = await reservar('finanzas', 'fallido.pdf')
    const finalizado = await administradora.rpc('finalizar_reporte_pension', { p_id: pendiente.id })
    expect(finalizado.error).not.toBeNull()
    expect((await listado()).map((r) => r.id).sort()).toEqual(antes.map((r) => r.id).sort())
    const abandonado = await administradora.rpc('abandonar_reporte_pension', { p_id: pendiente.id })
    expect(abandonado.error).toBeNull()
    const cola = await admin.from('pensiones_reportes_limpieza').select('ruta').eq('ruta', pendiente.ruta)
    expect(cola.data).toHaveLength(1)
  })

  it('mantiene 12 por categoría con cargas concurrentes y retira sólo los más antiguos', async () => {
    const inicial = await listado()
    const viejos = [...inicial]
    for (const categoria of ['finanzas', 'otras_utilidades'] as const) {
      let cantidad = inicial.filter((r) => r.categoria === categoria).length
      while (cantidad++ < 12) {
        const cargado = await cargar(categoria)
        viejos.push({ ...cargado, categoria })
      }
    }
    const nuevos = await Promise.all(Array.from({ length: 10 }, (_, i) => cargar(i % 2 === 0 ? 'finanzas' : 'otras_utilidades')))
    const disponibles = await listado()
    expect(disponibles).toHaveLength(24)
    expect(disponibles.filter((r) => r.categoria === 'finanzas')).toHaveLength(12)
    expect(disponibles.filter((r) => r.categoria === 'otras_utilidades')).toHaveLength(12)
    for (const nuevo of nuevos) expect(disponibles.some((r) => r.id === nuevo.id)).toBe(true)
    for (const categoria of ['finanzas', 'otras_utilidades']) {
      const retirados = viejos.filter((r) => r.categoria === categoria).slice(0, 5)
      for (const retirado of retirados) {
        expect(disponibles.some((r) => r.id === retirado.id)).toBe(false)
        const cola = await admin.from('pensiones_reportes_limpieza').select('ruta').eq('ruta', retirado.ruta)
        expect(cola.data).toHaveLength(1)
      }
    }
    // El reintento de una finalización confirmada no duplica ni vuelve a aplicar retención.
    expect((await administradora.rpc('finalizar_reporte_pension', { p_id: nuevos[0].id })).error).toBeNull()
    expect(await listado()).toHaveLength(24)
    // Cancelar después de confirmar tampoco puede encolar/borrar un documento vigente.
    expect((await administradora.rpc('abandonar_reporte_pension', { p_id: nuevos[0].id })).error).toBeNull()
    const colaVigente = await admin.from('pensiones_reportes_limpieza').select('ruta').eq('ruta', nuevos[0].ruta)
    expect(colaVigente.data).toEqual([])
  })

  it('reconcilia una carga tardía huérfana y nunca encola los documentos vigentes', async () => {
    const tardio = await reservar('otras_utilidades')
    await administradora.rpc('abandonar_reporte_pension', { p_id: tardio.id })
    // Simula limpieza anterior al término de la petición de Storage.
    await admin.from('pensiones_reportes_limpieza').delete().eq('ruta', tardio.ruta)
    expect((await admin.storage.from(BUCKET_REPORTES).upload(tardio.ruta, pdf, { contentType: 'application/pdf' })).error).toBeNull()
    const pendientes = await admin.rpc('preparar_limpieza_reportes_pension')
    expect(pendientes.error).toBeNull()
    expect(pendientes.data.some((r: { ruta: string }) => r.ruta === tardio.ruta)).toBe(true)
    const vigentes = new Set((await listado()).map((r) => r.ruta))
    for (const fila of pendientes.data) expect(vigentes.has(fila.ruta)).toBe(false)
    const restringido = await administradora.rpc('preparar_limpieza_reportes_pension')
    expect(restringido.error).not.toBeNull()
  })
})

describe('eliminar un reporte subido por error', () => {
  it('la Administradora lo quita: desaparece la ficha, la ruta pasa a la cola y los demás quedan', async () => {
    const sobra = await cargar('otras_utilidades')
    const error = await cargar('finanzas')
    const antes = await listado()
    const quitado = await administradora.rpc('eliminar_reporte_pension', { p_id: error.id })
    expect(quitado.error).toBeNull()
    const despues = await listado()
    expect(despues.some((r) => r.id === error.id)).toBe(false)
    expect(despues).toHaveLength(antes.length - 1)
    expect(despues.some((r) => r.id === sobra.id)).toBe(true)
    const cola = await admin.from('pensiones_reportes_limpieza').select('ruta').eq('ruta', error.ruta)
    expect(cola.data).toHaveLength(1)
  })

  it('quitar uno que ya no existe no es un error', async () => {
    const documento = await cargar('finanzas')
    expect((await administradora.rpc('eliminar_reporte_pension', { p_id: documento.id })).error).toBeNull()
    expect((await administradora.rpc('eliminar_reporte_pension', { p_id: documento.id })).error).toBeNull()
    expect((await administradora.rpc('eliminar_reporte_pension', { p_id: '00000000-0000-4000-8000-000000000000' })).error).toBeNull()
  })

  it('solo la Administradora: ni el Director, ni Residente, ni Administración, ni sin sesión', async () => {
    const documento = await cargar('finanzas')
    for (const cliente of [await clienteComo('director'), await clienteComo('residente'), await clienteComo('administracion'), clienteAnonimoPrueba()]) {
      const r = await cliente.rpc('eliminar_reporte_pension', { p_id: documento.id })
      expect(r.error).not.toBeNull()
    }
    expect((await listado()).some((r) => r.id === documento.id)).toBe(true)
  })
})
