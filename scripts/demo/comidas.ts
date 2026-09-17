import { TIEMPOS_COMIDA, type EstadoComida, type TiempoComida } from '@/lib/comidas/tipos'
import { fechaISOEn, lunesDe, sumarDias } from '@/lib/fechas'
import type { Database } from '@/lib/supabase/database.types'
import type { Sembrador } from './tipos'

type FilaPlan = Database['public']['Tables']['plan_semanal']['Insert']
type FilaSeleccion = Database['public']['Tables']['selecciones_comida']['Insert']
type Valor = { estado: EstadoComida; nota: string | null }

const SI: Valor = { estado: 'si', nota: null }
const DIAS_SEMANA = [1, 2, 3, 4, 5, 6, 7]

/** Plan de los 7 días; `variante` devuelve null para dejar esa comida sin plan. */
function planDemo(usuarioId: string, variante: (dia: number, comida: TiempoComida) => Valor | null): FilaPlan[] {
  return DIAS_SEMANA.flatMap((dia) =>
    TIEMPOS_COMIDA.flatMap((comida) => {
      const valor = variante(dia, comida)
      return valor ? [{ usuario_id: usuarioId, dia_semana: dia, comida, ...valor }] : []
    }),
  )
}

export const sembrarComidas: Sembrador = async (admin, usuarios) => {
  const planes: FilaPlan[] = [
    ...planDemo(usuarios.residente, () => SI),
    // Sacerdote: cena temprano (19:00) de lunes a viernes.
    ...planDemo(usuarios.sacerdote, (dia, comida) =>
      comida === 'cena' && dia <= 5 ? { estado: 'temprano', nota: '19:00' } : SI,
    ),
    // Numerario: almuerzo en bolsa martes y jueves.
    ...planDemo(usuarios.numerario, (dia, comida) =>
      comida === 'almuerzo' && (dia === 2 || dia === 4) ? { estado: 'bolsa', nota: null } : SI,
    ),
    // Director: sin plan el sábado, para que existan comidas "Sin definir".
    ...planDemo(usuarios.director, (dia) => (dia === 6 ? null : SI)),
  ]

  const { error: errorPlan } = await admin
    .from('plan_semanal')
    .upsert(planes, { onConflict: 'usuario_id,dia_semana,comida' })
  if (errorPlan) throw errorPlan

  const { error: errorSabado } = await admin
    .from('plan_semanal')
    .delete()
    .eq('usuario_id', usuarios.director)
    .eq('dia_semana', 6)
  if (errorSabado) throw errorSabado

  const lunesSiguiente = sumarDias(lunesDe(fechaISOEn(new Date())), 7)
  const excepciones: FilaSeleccion[] = [
    {
      usuario_id: usuarios.residente,
      fecha: sumarDias(lunesSiguiente, 2),
      comida: 'almuerzo',
      estado: 'tarde',
      nota: '13:30',
      origen: 'persona',
    },
    {
      usuario_id: usuarios.numerario,
      fecha: sumarDias(lunesSiguiente, 4),
      comida: 'cena',
      estado: 'no',
      nota: null,
      origen: 'persona',
    },
  ]
  const { error: errorSelecciones } = await admin
    .from('selecciones_comida')
    .upsert(excepciones, { onConflict: 'usuario_id,fecha,comida' })
  if (errorSelecciones) throw errorSelecciones

  console.log(`  planes demo: ${planes.length} filas; excepciones en la semana del ${lunesSiguiente}: ${excepciones.length}`)
}
