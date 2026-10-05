import { cuentasConCorreo, pasarADireccionInterna } from '@/lib/cuentas/borrar-correo'
import { crearClienteScript } from './cliente-script'

/*
 * Reemplaza en Supabase Auth el correo real de cada cuenta por una dirección interna
 * (spec 2026-10-05 §3). Se corre una sola vez, cuando ya se comprobó que la gente entra con su
 * usuario. No tiene vuelta atrás: los correos no quedan guardados en ningún lado (salvo en
 * `perfiles.correo`, hasta que se aplique la migración que borra esa columna).
 *
 * Sin `--confirmar` no cambia nada: solo dice cuántas cuentas cambiaría. Nunca imprime un correo.
 */
// tsx compila como CommonJS (sin "type": "module"): no usar await de nivel superior.
async function main() {
  const admin = crearClienteScript()
  const ids = await cuentasConCorreo(admin)

  if (ids.length === 0) {
    console.log('Ninguna cuenta tiene un correo real en Auth: no hay nada que borrar.')
    return
  }

  if (!process.argv.includes('--confirmar')) {
    console.log(`${ids.length} ${ids.length === 1 ? 'cuenta tiene' : 'cuentas tienen'} todavía un correo real en Auth.`)
    console.log('Esto modifica el proyecto de Supabase configurado en .env.local y no tiene vuelta atrás.')
    console.log('Para reemplazarlos por direcciones internas, volvé a ejecutar agregando: -- --confirmar')
    return
  }

  let cambiadas = 0
  for (const id of ids) {
    try {
      if ((await pasarADireccionInterna(admin, id)) === 'cambiada') cambiadas++
    } catch (error) {
      // Se sigue con las demás: el script es idempotente y se puede volver a correr.
      console.error(`No se pudo cambiar la cuenta ${id}:`, error instanceof Error ? error.message : error)
      process.exitCode = 1
    }
  }

  console.log(`Correos reemplazados por direcciones internas: ${cambiadas} de ${ids.length}.`)
  if (process.exitCode) console.log('Hubo errores: volvé a ejecutar el comando para completar las que faltan.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
