import type { Sembrador } from './tipos'

const HORA = 60 * 60 * 1000

const RECORDATORIO = 'Recuerden anotar su selección de comida de la semana antes de la hora límite. Gracias a todos.'
const RESPUESTA = 'Perfecto, gracias por el recordatorio.'
const CENA = 'El jueves cambiaremos la hora de la cena 30 minutos más tarde por mantenimiento de la cocina.'

/** Publicaciones del prototipo con su respuesta y reacciones. Idempotente. */
export const sembrarMensajes: Sembrador = async (admin, usuarios) => {
  const { data: existentes, error } = await admin
    .from('mensajes')
    .select('id')
    .is('padre_id', null)
    .in('texto', [RECORDATORIO, CENA])
  if (error) throw error
  if (existentes.length > 0) {
    console.log('  mensajes demo ya existen')
    return
  }

  const ahora = Date.now()
  const hace = (horas: number) => new Date(ahora - horas * HORA).toISOString()

  const { data: recordatorio, error: errorRecordatorio } = await admin
    .from('mensajes')
    .insert({ autor_id: usuarios.director, padre_id: null, texto: RECORDATORIO, creado_en: hace(20) })
    .select('id')
    .single()
  if (errorRecordatorio) throw errorRecordatorio

  const { error: errorMensajes } = await admin.from('mensajes').insert([
    { autor_id: usuarios.residente, padre_id: recordatorio.id, texto: RESPUESTA, creado_en: hace(18) },
    { autor_id: usuarios.administracion, padre_id: null, texto: CENA, creado_en: hace(5) },
  ])
  if (errorMensajes) throw errorMensajes

  const { error: errorReacciones } = await admin.from('reacciones').insert([
    { mensaje_id: recordatorio.id, usuario_id: usuarios.administracion },
    { mensaje_id: recordatorio.id, usuario_id: usuarios.residente },
  ])
  if (errorReacciones) throw errorReacciones

  console.log('  mensajes demo: 2 publicaciones, 1 respuesta, 2 reacciones')
}
