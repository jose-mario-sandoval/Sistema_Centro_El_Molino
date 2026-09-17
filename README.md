# Centro El Molino

Sistema web interno del centro: comidas, mensajes, calendario y configuraciones.

- **Diseño (spec):** `docs/superpowers/specs/2026-09-16-produccion-centro-el-molino-design.md`
- **Planes de implementación:** `docs/superpowers/plans/`
- **Prototipo original y su README:** `docs/prototipo/`

## Stack

Next.js 16 (App Router) + TypeScript · Supabase (Postgres, Auth, Realtime, pg_cron) · Vercel.

## Puesta en marcha (sin Docker)

1. Node 24 y `npm ci`.
2. Copiar `.env.example` a `.env.local` y completar con los datos del proyecto de Supabase.
3. `npm run datos-demo -- --confirmar` (solo antes del lanzamiento) y `npm run dev`.
4. Entrar con `residente@demo.test` / `demo-molino-2026` (u otra cuenta demo: `director@`, `sacerdote@`, `numerario@`, `administracion@`).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Pruebas unitarias (local) |
| `npm run test:integracion` / `npm run test:e2e` | Solo en CI (abortan fuera de Supabase local) |
| `npm run db:aplicar` | Aplica migraciones al proyecto por el Session pooler (`.env.local`) |
| `npm run db:tipos` | Regenera tipos desde el proyecto (requiere CLI logueada; alternativa: artefacto `database-types` de CI) |
| `npm run crear-director -- --nombre "…" --siglas XX --correo …` | Crea un Director con contraseña temporal |
| `npm run datos-demo -- --confirmar` | Cuentas y datos demo (`@demo.test`) |
| `npm run limpiar-datos-demo -- --confirmar` | Borra todo lo demo (checklist de lanzamiento) |

## Reglas de trabajo

- Ramas `feat/...` desde `master`, PR con revisión y CI en verde.
- Migraciones con `npx supabase migration new <nombre>`; se aplican al mergear el PR de esquema (Action de migraciones o `npm run db:aplicar`, índice §5).
- Funcionalidades con tablas nuevas: primero un PR de esquema, después el PR de pantallas (ver el índice de planes).
- Despliegue: Vercel (integración con Git) publica cada push a `master`.
- El repo debe seguir siendo **público** (requisito de Vercel Hobby).

## Reglas de negocio principales

Resumen; el detalle completo está en el spec.

- Roles: Director, Residente, Administración.
- Comidas por comida (desayuno, almuerzo, cena) con 6 estados; la semana parte del Plan semanal.
- Hora límite por comida (mismo día o día anterior) fijada por el Director; se edita la semana actual y la siguiente.
- Solo el Director crea, edita y elimina eventos.
- Cuentas: solo el Director las crea; se desactivan en lugar de borrarse; contraseña temporal obligatoria.
