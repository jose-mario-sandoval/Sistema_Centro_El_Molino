// Aplica supabase/migrations al proyecto usando el Session pooler (no requiere `supabase login` ni Docker).
// Uso: npm run db:aplicar            (aplica)
//      npm run db:aplicar -- --dry-run (solo muestra qué aplicaría)
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const contrasena = process.env.SUPABASE_DB_PASSWORD
const host = process.env.SUPABASE_POOLER_HOST

if (!url || !contrasena || !host) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_DB_PASSWORD o SUPABASE_POOLER_HOST en .env.local')
  process.exit(1)
}

const ref = new URL(url).hostname.split('.')[0]
const dbUrl = `postgresql://postgres.${ref}:${encodeURIComponent(contrasena)}@${host}:5432/postgres`

// El paquete npm `supabase` ya no trae un binario nativo en node_modules/supabase/bin:
// su "bin" (ver node_modules/supabase/package.json) es este script de Node, que a su vez
// resuelve y ejecuta el binario nativo específico de la plataforma
// (p. ej. @supabase/cli-windows-x64 en Windows). Lo invocamos con `node` en vez de
// intentar adivinar esa ruta interna, y así evitamos `shell: true`.
const binario = path.join('node_modules', 'supabase', 'dist', 'supabase.js')
if (!existsSync(binario)) {
  console.error(`No se encontró ${binario}. Ejecutá npm ci.`)
  process.exit(1)
}

const extra = process.argv.slice(2)
const argumentos = ['db', 'push', '--db-url', dbUrl, ...extra]
if (!extra.includes('--dry-run')) argumentos.push('--yes')

const r = spawnSync(process.execPath, [binario, ...argumentos], { stdio: 'inherit' })
process.exit(r.status ?? 1)
