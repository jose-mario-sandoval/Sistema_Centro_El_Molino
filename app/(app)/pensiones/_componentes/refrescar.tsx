'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { crearClienteNavegador } from '@/lib/supabase/navegador'

/** Realtime para pagos/cuotas; volver a la pestaña y sondeo cubren reconexiones y cambios de rol. */
export function RefrescarPensiones() {
  const router = useRouter()
  useEffect(() => {
    const supabase = crearClienteNavegador()
    let detenido = false
    let demora: ReturnType<typeof setTimeout> | undefined
    const refrescar = () => {
      clearTimeout(demora)
      if (!document.hidden) demora = setTimeout(() => router.refresh(), 600)
    }
    const canal = supabase.channel(`pensiones-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pensiones_pagos' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pensiones_cuotas' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pensiones_reportes' }, refrescar)
    void supabase.realtime.setAuth().then(() => {
      if (!detenido) canal.subscribe((estado) => { if (estado === 'SUBSCRIBED') refrescar() })
    }).catch(() => { /* El sondeo sigue actualizando si no se pudo abrir el canal. */ })
    const intervalo = setInterval(refrescar, 30_000)
    document.addEventListener('visibilitychange', refrescar)
    return () => {
      detenido = true
      clearTimeout(demora)
      clearInterval(intervalo)
      document.removeEventListener('visibilitychange', refrescar)
      void supabase.removeChannel(canal)
    }
  }, [router])
  return null
}
