# Borrar los correos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que no quede ningún correo de las personas ni en `perfiles` ni en Supabase Auth, una vez comprobado que todos entran con su usuario.

**Architecture:** Un comando (`npm run borrar-correos`) reemplaza en Auth, con la API de administración, el correo real de cada cuenta por una dirección interna; una migración borra la columna `perfiles.correo`. Nada del código depende ya de esa columna (invariante del PR 2), así que este PR es el comando, la migración, los tipos y tres literales de prueba.

**Tech Stack:** Supabase Auth (API admin), PostgreSQL, tsx, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-administracion-etiquetas-y-usuarios-design.md` §3, "Borrar los correos (PR 3)".

**Rama:** `claude/borrar-correos`, apilada sobre `claude/entrar-con-usuario` (PR 2). Rebasar sobre `master` cuando el PR 2 esté mergeado.

**No se revisó con un subagente:** el plan es de cuatro archivos y lo que tiene de riesgo (qué hace Auth al cambiar una dirección) lo comprueba la prueba de integración contra el Auth real del CI.

---

### Task 1: el comando

**Files:**
- Create: `lib/cuentas/borrar-correo.ts`, `scripts/borrar-correos.ts`
- Modify: `package.json` (script `borrar-correos`)
- Test: `tests/unit/cuentas/borrar-correo.test.ts`, `tests/integration/borrar-correos.test.ts`

- [x] `cuentasConCorreo(admin)`: recorre `auth.admin.listUsers` por páginas y devuelve los ids cuya dirección no es interna (`esDireccionInterna`).
- [x] `pasarADireccionInterna(admin, id)`: si ya es interna, `'ya-interna'`; si no, `auth.admin.updateUserById(id, { email: direccionInterna(), email_confirm: true })` y `'cambiada'`. Lanza si Auth falla.
- [x] El script: sin `--confirmar` dice cuántas cambiaría y sale; con `--confirmar` las cambia una por una, sigue ante un error (es idempotente: se vuelve a correr) y nunca imprime un correo.
- [x] Prueba unitaria con un cliente falso: filtro, paginado, idempotencia, error.
- [x] Prueba de integración con una cuenta descartable creada con correo: queda con dirección interna, su identidad tampoco conserva el correo, con el correo ya no se entra, con la dirección que da `direccionDeAcceso()` sí, y una sesión abierta antes del cambio se puede renovar.

### Task 2: la columna

**Files:**
- Create: `supabase/migrations/20261005120000_borrar_correos.sql` (`alter table public.perfiles drop column correo`)
- Modify: `lib/supabase/database.types.ts` (sin `correo` en `perfiles`), `tests/soporte/supabase-falso.ts`, `tests/unit/mensajes/acciones.test.ts`, `tests/unit/configuraciones/acciones.test.ts` (los literales de `Perfil` pierden `correo: null`)

- [x] Con la columna fuera de los tipos, `npm run typecheck` pasa: nada la leía.

### Task 3: documentación y PR

- [x] `CLAUDE.md` (sin correos en `perfiles`; para qué queda el comando) y `README.md` (tabla de comandos).
- [ ] `npm run lint && npm run typecheck && npm test` y build → PASS.
- [ ] PR contra `master`, en borrador hasta que el PR 2 esté mergeado y comprobado en producción.

### En producción, en este orden

1. `npm run borrar-correos` (sin argumentos) desde la carpeta principal del repo: dice cuántas cuentas cambiaría.
2. `npm run borrar-correos -- --confirmar`.
3. Comprobar otra vez que la gente entra. `perfiles.correo` sigue ahí por si hubiera que restaurar alguna dirección.
4. Pegar la migración `20261005120000_borrar_correos.sql` en el SQL Editor y mergear este PR.
