import { mesDe } from '@/lib/calendario/cuadricula'
import { fechaISOEn } from '@/lib/fechas'
import type { Sembrador } from './tipos'

/** Días 05, 12, 19 y 26: existen en todos los meses. */
const EVENTOS_DEMO: { dia: string; titulo: string; hora: string | null }[] = [
  { dia: '05', titulo: 'Retiro mensual (demo)', hora: null },
  { dia: '12', titulo: 'Charla formativa (demo)', hora: '19:30' },
  { dia: '19', titulo: 'Almuerzo con invitados (demo)', hora: '13:00' },
  { dia: '26', titulo: 'Limpieza general (demo)', hora: '09:00' },
]

/** Eventos del mes actual creados por el Director demo. Idempotente: no duplica. */
export const sembrarCalendario: Sembrador = async (admin, usuarios) => {
  const mes = mesDe(fechaISOEn(new Date()))

  const { data: existentes, error: errorLectura } = await admin
    .from('eventos')
    .select('titulo, fecha')
    .eq('creado_por', usuarios.director)
    .gte('fecha', `${mes}-01`)
    .lte('fecha', `${mes}-28`)
  if (errorLectura) throw errorLectura

  const yaCreados = new Set(existentes.map((e) => `${e.fecha}|${e.titulo}`))
  const nuevos = EVENTOS_DEMO.map((e) => ({
    titulo: e.titulo,
    fecha: `${mes}-${e.dia}`,
    hora: e.hora,
    creado_por: usuarios.director,
  })).filter((e) => !yaCreados.has(`${e.fecha}|${e.titulo}`))

  if (nuevos.length > 0) {
    const { error } = await admin.from('eventos').insert(nuevos)
    if (error) throw error
  }
  console.log(`  eventos demo en ${mes}: ${nuevos.length} nuevos, ${EVENTOS_DEMO.length - nuevos.length} ya existían`)
}
