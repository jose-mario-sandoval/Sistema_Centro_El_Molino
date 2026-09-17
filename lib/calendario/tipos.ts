import type { Tabla } from '@/lib/supabase/tipos'

/** Lo que muestran la cuadrícula y el modal del día. */
export type Evento = Pick<Tabla<'eventos'>, 'id' | 'titulo' | 'fecha' | 'hora'>
