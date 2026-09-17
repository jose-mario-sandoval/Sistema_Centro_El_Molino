// Imprime variables de entorno de la base temporal de CI en formato KEY=valor (para $GITHUB_ENV).
import { execSync } from 'node:child_process'

const estado = JSON.parse(execSync('npx supabase status -o json', { encoding: 'utf8' }))

function valor(...claves) {
  for (const clave of claves) if (estado[clave]) return estado[clave]
  throw new Error(`supabase status no devolvió ${claves.join(' / ')}`)
}

console.log(`NEXT_PUBLIC_SUPABASE_URL=${valor('API_URL')}`)
console.log(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${valor('ANON_KEY', 'PUBLISHABLE_KEY')}`)
console.log(`SUPABASE_SECRET_KEY=${valor('SERVICE_ROLE_KEY', 'SECRET_KEY')}`)
console.log(`SUPABASE_DB_URL=${valor('DB_URL')}`)
