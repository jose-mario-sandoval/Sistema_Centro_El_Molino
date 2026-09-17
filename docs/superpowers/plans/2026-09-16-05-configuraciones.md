# Configuraciones y gestión de usuarios — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:subagent-driven-development (recomendado) o superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para el seguimiento.

**Objetivo:** reemplazar la página provisional de Configuraciones por la sección completa:
- **Mi cuenta** (todos los roles): nombre, siglas y correo propios, y cambio de la propia contraseña pidiendo la actual;
- **Horas límite** (solo Director): una por comida, mismo día o día anterior;
- **Gestión de usuarios** (solo Director): crear cuentas con contraseña temporal, cambiar roles, poner contraseñas temporales y desactivar/reactivar.

**Arquitectura:**
- **Sin tablas nuevas:** un solo PR. Usa `perfiles` y `horas_limite` de la Fase 0.
- **Lecturas:** Server Component `app/(app)/configuraciones/page.tsx` con `crearClienteServidor()` (RLS).
- **Escrituras:** Server Actions en `app/(app)/configuraciones/acciones.ts` que validan con zod (`lib/validacion/configuraciones.ts`):
  - con la sesión del usuario: horas límite (política UPDATE solo Director) y la propia contraseña (ver decisiones);
  - con `crearClienteAdmin()`, siempre después de `perfilParaAccion(...)` (spec §2): perfil y correo propios, creación de cuentas, rol, contraseña temporal y bloqueos.
- **Verificación de la contraseña actual:** `signInWithPassword` en un cliente de `@supabase/supabase-js` sin persistencia de sesión; no toca las cookies (spec §4).
- **Lógica pura probada con Vitest:** esquemas zod, generador de contraseña temporal, conversión y descripción de horas límite, traducción de errores (`MOL02`).
- **UI:** clases del prototipo (`.settings-section`, `.settings-grid`, `.user-table`, `.field`, `.hint`, `.modal`), componentes de la Fase 0 (`Modal`, `BotonEnvio`, `useAviso`).

**Stack:** Next.js 16.3 (App Router, Server Actions, `revalidatePath` de `next/cache`), React 19.3 (`useActionState`, `useOptimistic`, `useTransition`), `@supabase/supabase-js` 2.116 (`auth.admin.createUser` / `updateUserById` con `email`, `email_confirm`, `password`, `ban_duration`), zod 4, Vitest 5, Playwright 1.63.

**Referencias:** spec §2 (escrituras con cliente admin), §4 completo, §5.1, §6.1 (efecto de cambiar horas límite), §9 · índice [`2026-09-16-00-indice.md`](2026-09-16-00-indice.md) §3 y §4 (contrato con 06-B) · Fase 0 [`2026-09-16-01-fase-0-base.md`](2026-09-16-01-fase-0-base.md) tareas 8–13, 15 y 16 · prototipo `docs/prototipo/centro-el-molino.html` (`renderConfiguraciones`, `openNewUserModal`).

**Antes de empezar:**
- La Fase 0 está mergeada en `master` (existen `crearCuenta`, `perfilParaAccion`, `Modal`, `BotonEnvio`, `useAviso`, `tests/soporte/usuarios-prueba.ts`).
- `.env.local` completo y `npm ci` ejecutado.
- Este PR **no** tiene migraciones: no hace falta `npm run db:tipos`.

**Decisiones tomadas en este plan:**
- **Tabla de cuentas:** `listarPerfiles` (contrato de la Fase 0) no devuelve `correo` ni `debe_cambiar_contrasena`. En lugar de cambiar su tipo `PerfilResumen`, que usan otras pistas, se agrega `listarCuentas()` en `lib/configuraciones/consultas.ts`.
- **Contraseña propia (se aparta de spec §2):**
  - Después de verificar la actual, se actualiza con `supabase.auth.updateUser({ password })` usando la sesión del usuario (`crearClienteServidor()`), igual que la Fase 0 en `/cambiar-contrasena`.
  - Motivo: al cambiar una contraseña, Supabase Auth cierra las sesiones del usuario. Por la sesión conserva la actual y cierra las demás; con `auth.admin.updateUserById` cerraría **todas**, incluida la del navegador desde donde se hizo el cambio.
  - Requiere `secure_password_change = false` en `[auth.email]` (valor por defecto; la Fase 0 no lo cambia).
- **Contraseña temporal a otra cuenta:** sí usa `auth.admin.updateUserById`. Que se cierren todas las sesiones de esa persona es lo deseado.
- **Orden al poner la contraseña temporal:** primero se marca `debe_cambiar_contrasena = true` y después se cambia la contraseña en Auth. Si Auth falla, se restaura la marca anterior. Así nunca queda una contraseña conocida por el Director sin cambio obligatorio.
- **Cambio de correo:** primero Auth (garantiza unicidad del login), después `perfiles.correo`. Si el perfil falla, se restaura el correo anterior en Auth.
- **Generador:** 12 símbolos de un alfabeto sin caracteres ambiguos (`0/o`, `1/l/i`), en tres grupos de 4 (`k7hm-pq3x-wn9d`). Usa Web Crypto, así que funciona en el navegador (botón "Generar") y en Node.
- **Restauración en e2e:** `asegurarUsuariosPrueba()` pasa a restaurar también `nombre` y `siglas` (tarea 1). Sin eso, la prueba que renombra al residente rompería `login.spec.ts`, que corre después.
- **Formularios con datos:** usan inputs controlados. React 19 resetea los formularios después de cada acción, y así un error de validación no borra lo escrito. El formulario de contraseña propia queda sin controlar: ahí el reseteo es deseable.

---

## Mapa de archivos

```
app/(app)/configuraciones/
  page.tsx                               reemplaza la provisional; secciones en orden (contrato con 06-B)
  error.tsx                              error de la sección con "Reintentar" (spec §9.1)
  acciones.ts                            Server Actions de la sección
  _componentes/
    usar-aviso-resultado.ts              aviso emergente para éxito y errores generales
    seccion-mi-cuenta.tsx                "Mi cuenta" (Server Component)
    formulario-mi-cuenta.tsx             nombre, siglas, correo y rol deshabilitado
    formulario-mi-contrasena.tsx         cambio de la propia contraseña
    seccion-horas-limite.tsx             "Horas límite" (Server Component)
    formulario-horas-limite.tsx          3 comidas × (día relativo + hora)
    seccion-gestion-usuarios.tsx         "Gestión de usuarios": tabla y modales
    fila-cuenta.tsx                      fila: rol, estado y acciones
    campo-contrasena-temporal.tsx        input + "Generar" y panel para entregar la contraseña
    modal-nueva-cuenta.tsx               crear cuenta
    modal-contrasena-temporal.tsx        poner contraseña temporal a otra cuenta
    modal-desactivar-cuenta.tsx          confirmación de desactivación
lib/
  validacion/configuraciones.ts          esquemas zod
  cuentas/contrasena-temporal.ts         generador (Web Crypto)
  cuentas/verificar-contrasena.ts        signInWithPassword sin sesión persistente (server-only)
  configuraciones/tipos.ts               tipo Cuenta
  configuraciones/horas-limite.ts        filas → HorasLimite, descripción del cierre
  configuraciones/errores.ts             mensajes y traducción de MOL02 / 23505
  configuraciones/consultas.ts           obtenerHorasLimite, listarCuentas (server-only)
app/globals.css                          (modificar) estilos de la sección
tests/
  soporte/usuarios-prueba.ts             (modificar) restaura también nombre y siglas
  unit/cuentas/contrasena-temporal.test.ts
  unit/configuraciones/validacion.test.ts
  unit/configuraciones/horas-limite.test.ts
  unit/configuraciones/errores.test.ts
  e2e/configuraciones.spec.ts
```

---

### Tarea 1: Rama y restauración completa de los usuarios de prueba

**Archivos:**
- Modificar: `tests/soporte/usuarios-prueba.ts`

- [ ] **Paso 1: Crear la rama**

```bash
git switch master && git pull && git switch -c feat/configuraciones
```

Esperado: `Switched to a new branch 'feat/configuraciones'`.

- [ ] **Paso 2: Confirmar que `asegurarUsuariosPrueba` ya restaura nombre y siglas**

La Fase 0 ya lo incluye. Verificarlo:

```bash
grep -n "nombre: u.nombre, siglas: u.siglas" tests/soporte/usuarios-prueba.ts
```

Esperado: una línea dentro de `asegurarUsuariosPrueba`. Si no aparece (Fase 0 implementada con una versión anterior del plan), agregar `nombre: u.nombre, siglas: u.siglas` al `.update({ … })` de los usuarios existentes y commitear con `test: asegurarUsuariosPrueba restaura también nombre y siglas`.

El correo no se restaura porque la búsqueda es por correo; ninguna prueba de esta pista cambia el correo de un usuario de prueba.

---

### Tarea 2: Generador de contraseña temporal

**Archivos:**
- Crear: `lib/cuentas/contrasena-temporal.ts`
- Prueba: `tests/unit/cuentas/contrasena-temporal.test.ts`

- [ ] **Paso 1: Escribir la prueba que falla**

`tests/unit/cuentas/contrasena-temporal.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ALFABETO_CONTRASENA, generarContrasenaTemporal } from '@/lib/cuentas/contrasena-temporal'

const FORMATO = /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/

describe('generarContrasenaTemporal', () => {
  it('genera 12 símbolos legibles en tres grupos de 4', () => {
    const contrasena = generarContrasenaTemporal()
    expect(contrasena).toMatch(FORMATO)
    expect(contrasena.replaceAll('-', '')).toHaveLength(12)
  })

  it('no usa caracteres que se confunden al dictarlos o copiarlos', () => {
    for (const ambiguo of ['0', 'o', 'O', '1', 'l', 'i', 'I']) {
      expect(ALFABETO_CONTRASENA).not.toContain(ambiguo)
    }
  })

  it('no repite contraseñas', () => {
    const generadas = new Set(Array.from({ length: 500 }, () => generarContrasenaTemporal()))
    expect(generadas.size).toBe(500)
  })

  it('descarta los bytes que sesgarían la distribución', () => {
    // 31 símbolos: se aceptan bytes 0–247 (248 = 8 × 31); 248 y 255 se descartan.
    const bytes = [255, 248, 247, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    let posicion = 0
    const fuente = (cantidad: number) => Uint8Array.from({ length: cantidad }, () => bytes[posicion++ % bytes.length])
    expect(generarContrasenaTemporal(fuente)).toBe('9abc-defg-hjkm')
  })
})
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Run: `npm test -- tests/unit/cuentas`
Esperado: FAIL con `Failed to resolve import "@/lib/cuentas/contrasena-temporal"`.

- [ ] **Paso 3: Implementar `lib/cuentas/contrasena-temporal.ts`**

Sin `server-only`: lo usa el botón "Generar" en el navegador.

```ts
/** Sin 0/o ni 1/l/i: se dicta o se copia a mano sin confusiones. */
export const ALFABETO_CONTRASENA = 'abcdefghjkmnpqrstuvwxyz23456789'

const SIMBOLOS = 12
const TAMANO_GRUPO = 4

function bytesSeguros(cantidad: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(cantidad))
}

/**
 * Contraseña temporal legible: 12 símbolos aleatorios en tres grupos (`k7hm-pq3x-wn9d`).
 * Usa Web Crypto (navegador y Node 24). `bytesAleatorios` solo se reemplaza en pruebas.
 */
export function generarContrasenaTemporal(
  bytesAleatorios: (cantidad: number) => Uint8Array = bytesSeguros,
): string {
  // Descartar los bytes >= límite evita el sesgo de `byte % 31`.
  const limite = 256 - (256 % ALFABETO_CONTRASENA.length)
  const simbolos: string[] = []

  while (simbolos.length < SIMBOLOS) {
    for (const byte of bytesAleatorios(SIMBOLOS)) {
      if (byte >= limite) continue
      simbolos.push(ALFABETO_CONTRASENA[byte % ALFABETO_CONTRASENA.length])
      if (simbolos.length === SIMBOLOS) break
    }
  }

  const grupos: string[] = []
  for (let i = 0; i < SIMBOLOS; i += TAMANO_GRUPO) {
    grupos.push(simbolos.slice(i, i + TAMANO_GRUPO).join(''))
  }
  return grupos.join('-')
}
```

- [ ] **Paso 4: Correr la prueba y verificar que pasa**

Run: `npm test -- tests/unit/cuentas`
Esperado: PASS (4 pruebas).

- [ ] **Paso 5: Commit**

```bash
git add lib/cuentas/contrasena-temporal.ts tests/unit/cuentas
git commit -m "feat: generador de contraseñas temporales legibles"
```

---
### Tarea 3: Esquemas zod de Configuraciones

**Archivos:**
- Crear: `lib/validacion/configuraciones.ts`
- Prueba: `tests/unit/configuraciones/validacion.test.ts`

- [ ] **Paso 1: Escribir la prueba que falla**

`tests/unit/configuraciones/validacion.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { camposConError } from '@/lib/validacion/auth'
import {
  esquemaCambioContrasenaPropia,
  esquemaCambioRol,
  esquemaContrasenaTemporal,
  esquemaEstadoCuenta,
  esquemaHorasLimite,
  esquemaNuevaCuenta,
  esquemaPerfilPropio,
} from '@/lib/validacion/configuraciones'

const ID = '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b'

function campos(resultado: { success: boolean; error?: Parameters<typeof camposConError>[0] }) {
  if (resultado.success || !resultado.error) throw new Error('Se esperaba un error de validación')
  return camposConError(resultado.error)
}

describe('esquemaPerfilPropio', () => {
  it('recorta espacios, pasa las siglas a mayúsculas y el correo a minúsculas', () => {
    const r = esquemaPerfilPropio.safeParse({ nombre: '  Juan Pérez ', siglas: ' jp ', correo: ' Juan@Centro.ORG ' })
    expect(r.success && r.data).toEqual({ nombre: 'Juan Pérez', siglas: 'JP', correo: 'juan@centro.org' })
  })

  it('marca cada campo inválido', () => {
    expect(campos(esquemaPerfilPropio.safeParse({ nombre: '  ', siglas: 'ABCDEFG', correo: 'no-es-correo' }))).toEqual({
      nombre: 'Ingresá el nombre.',
      siglas: 'Las siglas pueden tener hasta 6 caracteres.',
      correo: 'Ingresá un correo válido.',
    })
  })
})

describe('esquemaCambioContrasenaPropia', () => {
  const valido = { actual: 'clave-actual-1', nueva: 'clave-nueva-2', confirmacion: 'clave-nueva-2' }

  it('acepta un cambio válido', () => {
    const r = esquemaCambioContrasenaPropia.safeParse(valido)
    expect(r.success && r.data).toEqual(valido)
  })

  it('pide la contraseña actual', () => {
    expect(campos(esquemaCambioContrasenaPropia.safeParse({ ...valido, actual: '' }))).toEqual({
      actual: 'Ingresá tu contraseña actual.',
    })
  })

  it('exige al menos 8 caracteres', () => {
    expect(
      campos(esquemaCambioContrasenaPropia.safeParse({ ...valido, nueva: 'corta', confirmacion: 'corta' })),
    ).toEqual({ nueva: 'La contraseña debe tener al menos 8 caracteres.' })
  })

  it('exige que la confirmación coincida', () => {
    expect(campos(esquemaCambioContrasenaPropia.safeParse({ ...valido, confirmacion: 'otra-cosa-3' }))).toEqual({
      confirmacion: 'Las contraseñas no coinciden.',
    })
  })

  it('rechaza repetir la contraseña actual', () => {
    const misma = { actual: 'misma-clave-1', nueva: 'misma-clave-1', confirmacion: 'misma-clave-1' }
    expect(campos(esquemaCambioContrasenaPropia.safeParse(misma))).toEqual({
      nueva: 'La contraseña nueva debe ser distinta de la actual.',
    })
  })
})

describe('esquemaHorasLimite', () => {
  const formulario = {
    desayuno_dia: '-1',
    desayuno_hora: '21:00',
    almuerzo_dia: '0',
    almuerzo_hora: '10:30',
    cena_dia: '0',
    cena_hora: '16:00:00',
  }

  it('convierte los campos del formulario en HorasLimite', () => {
    const r = esquemaHorasLimite.safeParse(formulario)
    expect(r.success && r.data).toEqual({
      desayuno: { diaRelativo: -1, hora: '21:00' },
      almuerzo: { diaRelativo: 0, hora: '10:30' },
      cena: { diaRelativo: 0, hora: '16:00' },
    })
  })

  it('solo acepta mismo día o día anterior', () => {
    expect(campos(esquemaHorasLimite.safeParse({ ...formulario, almuerzo_dia: '1' }))).toEqual({
      almuerzo_dia: 'Elegí mismo día o día anterior.',
    })
  })

  it('rechaza horas inválidas', () => {
    expect(campos(esquemaHorasLimite.safeParse({ ...formulario, cena_hora: '25:00' }))).toEqual({
      cena_hora: 'Ingresá una hora válida (HH:MM).',
    })
  })
})

describe('esquemaNuevaCuenta', () => {
  const datos = {
    nombre: 'Ana Torres',
    siglas: 'at',
    correo: 'Ana@Centro.org',
    rol: 'administracion',
    contrasena: 'k7hm-pq3x-wn9d',
  }

  it('acepta y normaliza una cuenta nueva', () => {
    const r = esquemaNuevaCuenta.safeParse(datos)
    expect(r.success && r.data).toEqual({ ...datos, siglas: 'AT', correo: 'ana@centro.org' })
  })

  it('rechaza un rol inexistente', () => {
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, rol: 'jefe' }))).toEqual({ rol: 'Elegí un rol.' })
  })

  it('exige una contraseña temporal de al menos 8 caracteres', () => {
    expect(campos(esquemaNuevaCuenta.safeParse({ ...datos, contrasena: 'corta' }))).toEqual({
      contrasena: 'La contraseña debe tener al menos 8 caracteres.',
    })
  })
})

describe('acciones sobre otras cuentas', () => {
  it('contraseña temporal: exige un id de cuenta válido', () => {
    expect(esquemaContrasenaTemporal.safeParse({ id: ID, contrasena: 'abcd-efgh-jkmn' }).success).toBe(true)
    expect(campos(esquemaContrasenaTemporal.safeParse({ id: 'no-es-uuid', contrasena: 'abcd-efgh-jkmn' }))).toEqual({
      id: 'Cuenta inválida.',
    })
  })

  it('cambio de rol: solo roles existentes', () => {
    expect(esquemaCambioRol.safeParse({ id: ID, rol: 'residente' }).success).toBe(true)
    expect(esquemaCambioRol.safeParse({ id: ID, rol: 'superusuario' }).success).toBe(false)
  })

  it('estado: activo debe ser booleano', () => {
    expect(esquemaEstadoCuenta.safeParse({ id: ID, activo: false }).success).toBe(true)
    expect(esquemaEstadoCuenta.safeParse({ id: ID, activo: 'false' }).success).toBe(false)
  })
})
```

- [ ] **Paso 2: Correr la prueba y verificar que falla**

Run: `npm test -- tests/unit/configuraciones/validacion`
Esperado: FAIL con `Failed to resolve import "@/lib/validacion/configuraciones"`.

- [ ] **Paso 3: Implementar `lib/validacion/configuraciones.ts`**

```ts
import { z } from 'zod'
import type { HorasLimite } from '@/lib/comidas/tipos'
import { ROLES } from '@/lib/perfiles/roles'
import { esquemaContrasenaNueva } from '@/lib/validacion/auth'

const MENSAJE_MINIMO_CONTRASENA = 'La contraseña debe tener al menos 8 caracteres.'

// Límites iguales a los checks de la tabla perfiles (Fase 0, migración base).
const nombre = z.string().trim().min(1, 'Ingresá el nombre.').max(120, 'El nombre puede tener hasta 120 caracteres.')
const siglas = z
  .string()
  .trim()
  .min(1, 'Ingresá las siglas.')
  .max(6, 'Las siglas pueden tener hasta 6 caracteres.')
  .toUpperCase()
const correo = z.string().trim().toLowerCase().email('Ingresá un correo válido.')
const contrasenaTemporal = z.string().min(8, MENSAJE_MINIMO_CONTRASENA)
const idCuenta = z.uuid('Cuenta inválida.')
const rol = z.enum(ROLES, { error: 'Elegí un rol.' })

// ---------- Mi cuenta ----------

/** Nombre, siglas y correo de la propia cuenta (spec §4). */
export const esquemaPerfilPropio = z.object({ nombre, siglas, correo })

/** Cambio de la propia contraseña: pide la actual (spec §4). */
export const esquemaCambioContrasenaPropia = z
  .object({ actual: z.string().min(1, 'Ingresá tu contraseña actual.') })
  .and(esquemaContrasenaNueva)
  .refine((d) => d.nueva !== d.actual, {
    message: 'La contraseña nueva debe ser distinta de la actual.',
    path: ['nueva'],
  })

// ---------- Horas límite ----------

const diaRelativo = z
  .enum(['0', '-1'], { error: 'Elegí mismo día o día anterior.' })
  .transform((valor): 0 | -1 => (valor === '-1' ? -1 : 0))

const hora = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Ingresá una hora válida (HH:MM).')
  .transform((valor) => valor.slice(0, 5))

/** Campos planos del formulario (`<comida>_dia`, `<comida>_hora`) → HorasLimite. */
export const esquemaHorasLimite = z
  .object({
    desayuno_dia: diaRelativo,
    desayuno_hora: hora,
    almuerzo_dia: diaRelativo,
    almuerzo_hora: hora,
    cena_dia: diaRelativo,
    cena_hora: hora,
  })
  .transform(
    (d): HorasLimite => ({
      desayuno: { diaRelativo: d.desayuno_dia, hora: d.desayuno_hora },
      almuerzo: { diaRelativo: d.almuerzo_dia, hora: d.almuerzo_hora },
      cena: { diaRelativo: d.cena_dia, hora: d.cena_hora },
    }),
  )

// ---------- Gestión de usuarios (Director) ----------

export const esquemaNuevaCuenta = z.object({ nombre, siglas, correo, rol, contrasena: contrasenaTemporal })

export const esquemaContrasenaTemporal = z.object({ id: idCuenta, contrasena: contrasenaTemporal })

export const esquemaCambioRol = z.object({ id: idCuenta, rol })

export const esquemaEstadoCuenta = z.object({ id: idCuenta, activo: z.boolean({ error: 'Estado inválido.' }) })
```

- [ ] **Paso 4: Correr la prueba y verificar que pasa**

Run: `npm test -- tests/unit/configuraciones/validacion`
Esperado: PASS (16 pruebas).

Si `esquemaCambioContrasenaPropia` falla al combinar con `.and(...)`, no cambiar las pruebas: reemplazar la intersección por un `z.object({ actual, nueva, confirmacion })` con los mismos mensajes y las dos validaciones `.refine` (coincidencia con `path: ['confirmacion']` y distinta de la actual con `path: ['nueva']`).

- [ ] **Paso 5: Commit**

```bash
git add lib/validacion/configuraciones.ts tests/unit/configuraciones/validacion.test.ts
git commit -m "feat: esquemas zod de Mi cuenta, horas límite y gestión de usuarios"
```

---

### Tarea 4: Lógica pura de horas límite y traducción de errores

**Archivos:**
- Crear: `lib/configuraciones/horas-limite.ts`, `lib/configuraciones/errores.ts`
- Prueba: `tests/unit/configuraciones/horas-limite.test.ts`, `tests/unit/configuraciones/errores.test.ts`

- [ ] **Paso 1: Escribir las pruebas que fallan**

`tests/unit/configuraciones/horas-limite.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { describirCierre, horasLimiteDesdeFilas } from '@/lib/configuraciones/horas-limite'

describe('horasLimiteDesdeFilas', () => {
  it('convierte las filas de la base en HorasLimite sin segundos', () => {
    expect(
      horasLimiteDesdeFilas([
        { comida: 'cena', dia_relativo: 0, hora: '16:00:00' },
        { comida: 'desayuno', dia_relativo: -1, hora: '21:00:00' },
        { comida: 'almuerzo', dia_relativo: 0, hora: '10:30:00' },
      ]),
    ).toEqual({
      desayuno: { diaRelativo: -1, hora: '21:00' },
      almuerzo: { diaRelativo: 0, hora: '10:30' },
      cena: { diaRelativo: 0, hora: '16:00' },
    })
  })

  it('falla si falta una comida', () => {
    expect(() => horasLimiteDesdeFilas([{ comida: 'desayuno', dia_relativo: -1, hora: '21:00:00' }])).toThrow(
      'Falta la hora límite de almuerzo.',
    )
  })
})

describe('describirCierre', () => {
  it('describe el mismo día y el día anterior', () => {
    expect(describirCierre({ diaRelativo: 0, hora: '10:00' })).toBe('cierra el mismo día a las 10:00')
    expect(describirCierre({ diaRelativo: -1, hora: '21:00:00' })).toBe('cierra el día anterior a las 21:00')
  })
})
```

`tests/unit/configuraciones/errores.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MENSAJE_CORREO_REPETIDO, MENSAJE_DIRECTOR_MINIMO, mensajeErrorPerfil } from '@/lib/configuraciones/errores'

describe('mensajeErrorPerfil', () => {
  it('traduce la regla de Director activo mínimo (MOL02)', () => {
    expect(mensajeErrorPerfil({ code: 'MOL02' }, 'respaldo')).toBe('Debe quedar al menos un Director activo.')
    expect(MENSAJE_DIRECTOR_MINIMO).toBe('Debe quedar al menos un Director activo.')
  })

  it('traduce el correo repetido (23505)', () => {
    expect(mensajeErrorPerfil({ code: '23505' }, 'respaldo')).toBe(MENSAJE_CORREO_REPETIDO)
  })

  it('usa el mensaje de respaldo para cualquier otro error', () => {
    expect(mensajeErrorPerfil({ code: '42501' }, 'No se pudo cambiar el rol.')).toBe('No se pudo cambiar el rol.')
    expect(mensajeErrorPerfil(null, 'No se pudo cambiar el rol.')).toBe('No se pudo cambiar el rol.')
  })
})
```

- [ ] **Paso 2: Correr las pruebas y verificar que fallan**

Run: `npm test -- tests/unit/configuraciones/horas-limite tests/unit/configuraciones/errores`
Esperado: FAIL con `Failed to resolve import "@/lib/configuraciones/horas-limite"` y `Failed to resolve import "@/lib/configuraciones/errores"`.

- [ ] **Paso 3: Implementar `lib/configuraciones/horas-limite.ts`**

Sin `server-only`: `describirCierre` se usa en el formulario (navegador).

```ts
import { TIEMPOS_COMIDA, type HoraLimite, type HorasLimite, type TiempoComida } from '@/lib/comidas/tipos'
import { horaHHMM } from '@/lib/fechas'

/** Forma de una fila de `horas_limite` tal como la devuelve Supabase. */
export type FilaHoraLimite = { comida: TiempoComida; dia_relativo: number; hora: string }

export function horasLimiteDesdeFilas(filas: FilaHoraLimite[]): HorasLimite {
  const horas = {} as HorasLimite
  for (const comida of TIEMPOS_COMIDA) {
    const fila = filas.find((f) => f.comida === comida)
    if (!fila) throw new Error(`Falta la hora límite de ${comida}.`)
    horas[comida] = { diaRelativo: fila.dia_relativo === -1 ? -1 : 0, hora: horaHHMM(fila.hora) }
  }
  return horas
}

/** "cierra el mismo día a las 10:00" / "cierra el día anterior a las 21:00". */
export function describirCierre({ diaRelativo, hora }: HoraLimite): string {
  return `cierra ${diaRelativo === -1 ? 'el día anterior' : 'el mismo día'} a las ${horaHHMM(hora)}`
}
```

- [ ] **Paso 4: Implementar `lib/configuraciones/errores.ts`**

```ts
export const MENSAJE_CORREO_REPETIDO = 'Ya existe una cuenta con ese correo.'
export const MENSAJE_DIRECTOR_MINIMO = 'Debe quedar al menos un Director activo.'

/**
 * Traduce errores de Postgres al escribir `perfiles`:
 * - MOL02: trigger de Director activo mínimo (spec §3.3, índice §3.4);
 * - 23505: unicidad de `perfiles.correo`.
 */
export function mensajeErrorPerfil(error: { code?: string } | null, respaldo: string): string {
  if (error?.code === 'MOL02') return MENSAJE_DIRECTOR_MINIMO
  if (error?.code === '23505') return MENSAJE_CORREO_REPETIDO
  return respaldo
}
```

- [ ] **Paso 5: Correr las pruebas y verificar que pasan**

Run: `npm test`
Esperado: PASS; las nuevas son 3 de horas límite y 3 de errores.

- [ ] **Paso 6: Commit**

```bash
git add lib/configuraciones tests/unit/configuraciones/horas-limite.test.ts tests/unit/configuraciones/errores.test.ts
git commit -m "feat: conversión de horas límite y traducción de errores de perfiles"
```

---

### Tarea 5: Consultas del servidor y verificación de contraseña

**Archivos:**
- Crear: `lib/configuraciones/tipos.ts`, `lib/configuraciones/consultas.ts`, `lib/cuentas/verificar-contrasena.ts`

Estos módulos hablan con Supabase: no llevan prueba unitaria. Los cubren las e2e de la tarea 14 en CI.

- [ ] **Paso 1: `lib/configuraciones/tipos.ts`**

Sin `server-only`: los Client Components importan el tipo.

```ts
import type { Tabla } from '@/lib/supabase/tipos'

/** Fila de la tabla de gestión de usuarios (incluye cuentas desactivadas). */
export type Cuenta = Pick<
  Tabla<'perfiles'>,
  'id' | 'nombre' | 'siglas' | 'correo' | 'rol' | 'activo' | 'debe_cambiar_contrasena'
>
```

- [ ] **Paso 2: `lib/configuraciones/consultas.ts`**

```ts
import 'server-only'
import type { HorasLimite } from '@/lib/comidas/tipos'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { horasLimiteDesdeFilas } from './horas-limite'
import type { Cuenta } from './tipos'

/** Las 3 horas límite vigentes (RLS: cualquier usuario activo las lee). */
export async function obtenerHorasLimite(): Promise<HorasLimite> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase.from('horas_limite').select('comida, dia_relativo, hora')
  if (error) throw error
  return horasLimiteDesdeFilas(data)
}

/**
 * Todas las cuentas, incluidas las desactivadas: primero las activas, después por nombre.
 * `listarPerfiles` (Fase 0) no incluye correo ni la marca de contraseña temporal.
 */
export async function listarCuentas(): Promise<Cuenta[]> {
  const supabase = await crearClienteServidor()
  const { data, error } = await supabase
    .from('perfiles')
    .select('id, nombre, siglas, correo, rol, activo, debe_cambiar_contrasena')
    .order('activo', { ascending: false })
    .order('nombre')
  if (error) throw error
  return data
}
```

- [ ] **Paso 3: `lib/cuentas/verificar-contrasena.ts`**

```ts
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { variableEntorno } from '@/lib/entorno'
import type { Database } from '@/lib/supabase/database.types'

/**
 * Verifica la contraseña con un cliente sin persistencia de sesión (spec §4):
 * no lee ni escribe las cookies de la sesión abierta en el navegador.
 */
export async function verificarContrasena(correo: string, contrasena: string): Promise<boolean> {
  const verificador = createClient<Database>(
    variableEntorno('NEXT_PUBLIC_SUPABASE_URL'),
    variableEntorno('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  )

  const { data, error } = await verificador.auth.signInWithPassword({ email: correo, password: contrasena })
  if (error || !data.session) return false

  // Cierra solo la sesión recién creada. El alcance por defecto ('global')
  // cerraría también la sesión del navegador de esta persona.
  await verificador.auth.signOut({ scope: 'local' })
  return true
}
```

- [ ] **Paso 4: Verificar tipos y lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores.

- [ ] **Paso 5: Commit**

```bash
git add lib/configuraciones/tipos.ts lib/configuraciones/consultas.ts lib/cuentas/verificar-contrasena.ts
git commit -m "feat: consultas de configuraciones y verificación de contraseña sin sesión"
```

---
### Tarea 6: Server Actions

**Archivos:**
- Crear: `app/(app)/configuraciones/acciones.ts`

Todas siguen el índice §3.3:
1. `perfilParaAccion(...)`;
2. zod;
3. escritura;
4. `revalidatePath`;
5. `exito`.

Un archivo `'use server'` solo exporta funciones async: las constantes quedan sin exportar o en `lib/configuraciones/errores.ts`.

- [ ] **Paso 1: Crear el archivo con los imports y las acciones de "Mi cuenta"**

`app/(app)/configuraciones/acciones.ts`:

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { exito, fallo, type Resultado } from '@/lib/acciones/resultado'
import { perfilParaAccion } from '@/lib/auth/sesion'
import { TIEMPOS_COMIDA } from '@/lib/comidas/tipos'
import { MENSAJE_CORREO_REPETIDO, mensajeErrorPerfil } from '@/lib/configuraciones/errores'
import { crearCuenta } from '@/lib/cuentas/crear-cuenta'
import { verificarContrasena } from '@/lib/cuentas/verificar-contrasena'
import { crearClienteAdmin } from '@/lib/supabase/admin'
import { crearClienteServidor } from '@/lib/supabase/servidor'
import { camposConError } from '@/lib/validacion/auth'
import {
  esquemaCambioContrasenaPropia,
  esquemaCambioRol,
  esquemaContrasenaTemporal,
  esquemaEstadoCuenta,
  esquemaHorasLimite,
  esquemaNuevaCuenta,
  esquemaPerfilPropio,
} from '@/lib/validacion/configuraciones'

const MENSAJE_REVISAR = 'Revisá los datos.'

/** `ban_duration` de Supabase Auth: ~100 años equivale a un bloqueo sin fecha de fin. */
const DURACION_BLOQUEO = '876000h'

// ---------- Mi cuenta (cualquier rol, solo la propia cuenta) ----------

export async function guardarMiCuenta(_previo: Resultado<null> | null, formData: FormData): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion()
  if (!acceso.ok) return acceso
  const { perfil } = acceso

  const entrada = esquemaPerfilPropio.safeParse({
    nombre: formData.get('nombre'),
    siglas: formData.get('siglas'),
    correo: formData.get('correo'),
  })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))
  const { nombre, siglas, correo } = entrada.data

  const admin = crearClienteAdmin()
  const cambiaCorreo = correo !== perfil.correo

  // Spec §4: el correo se cambia por el servidor, sin confirmación, validando unicidad.
  if (cambiaCorreo) {
    const { data: otra } = await admin
      .from('perfiles')
      .select('id')
      .eq('correo', correo)
      .neq('id', perfil.id)
      .maybeSingle()
    if (otra) return fallo(MENSAJE_REVISAR, { correo: MENSAJE_CORREO_REPETIDO })

    const { error } = await admin.auth.admin.updateUserById(perfil.id, { email: correo, email_confirm: true })
    if (error) {
      if (error.code === 'email_exists') return fallo(MENSAJE_REVISAR, { correo: MENSAJE_CORREO_REPETIDO })
      return fallo('No se pudo cambiar el correo. Intentá de nuevo.')
    }
  }

  const { error } = await admin.from('perfiles').update({ nombre, siglas, correo }).eq('id', perfil.id)
  if (error) {
    // Deja Auth como estaba para que el login y el perfil no queden con correos distintos.
    if (cambiaCorreo) await admin.auth.admin.updateUserById(perfil.id, { email: perfil.correo, email_confirm: true })
    const mensaje = mensajeErrorPerfil(error, 'No se pudieron guardar los cambios. Intentá de nuevo.')
    if (mensaje === MENSAJE_CORREO_REPETIDO) return fallo(MENSAJE_REVISAR, { correo: mensaje })
    return fallo(mensaje)
  }

  revalidatePath('/configuraciones')
  revalidatePath('/', 'layout') // la barra lateral muestra nombre y siglas
  return exito(null)
}

export async function cambiarMiContrasena(
  _previo: Resultado<null> | null,
  formData: FormData,
): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion()
  if (!acceso.ok) return acceso
  const { perfil } = acceso

  const entrada = esquemaCambioContrasenaPropia.safeParse({
    actual: formData.get('actual'),
    nueva: formData.get('nueva'),
    confirmacion: formData.get('confirmacion'),
  })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))

  const correcta = await verificarContrasena(perfil.correo, entrada.data.actual)
  if (!correcta) return fallo(MENSAJE_REVISAR, { actual: 'La contraseña actual no es correcta.' })

  // Con la sesión, no con el cliente admin: Auth cierra las demás sesiones y conserva esta.
  // `auth.admin.updateUserById` cerraría todas, incluida la de este navegador.
  const supabase = await crearClienteServidor()
  const { error } = await supabase.auth.updateUser({ password: entrada.data.nueva })
  if (error) {
    if (error.code === 'same_password') {
      return fallo(MENSAJE_REVISAR, { nueva: 'La contraseña nueva debe ser distinta de la actual.' })
    }
    if (error.code === 'weak_password') {
      return fallo(MENSAJE_REVISAR, { nueva: 'La contraseña es demasiado débil. Probá con una más larga.' })
    }
    return fallo('No se pudo cambiar la contraseña. Intentá de nuevo.')
  }

  revalidatePath('/configuraciones')
  return exito(null)
}
```

- [ ] **Paso 2: Agregar al final la acción de horas límite**

```ts
// ---------- Horas límite (Director) ----------

export async function guardarHorasLimite(
  _previo: Resultado<null> | null,
  formData: FormData,
): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const entrada = esquemaHorasLimite.safeParse(Object.fromEntries(formData))
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))
  const horas = entrada.data

  // Con la sesión del usuario: RLS permite UPDATE solo al Director (spec §5.2).
  // `.select()` detecta el caso en que RLS filtra la fila sin dar error (0 filas).
  const supabase = await crearClienteServidor()
  const resultados = await Promise.all(
    TIEMPOS_COMIDA.map((comida) =>
      supabase
        .from('horas_limite')
        .update({ dia_relativo: horas[comida].diaRelativo, hora: horas[comida].hora })
        .eq('comida', comida)
        .select('comida'),
    ),
  )
  if (resultados.some((r) => r.error || !r.data?.length)) {
    return fallo('No se pudieron guardar las horas límite. Intentá de nuevo.')
  }

  revalidatePath('/configuraciones')
  return exito(null)
}
```

- [ ] **Paso 3: Agregar al final la creación de cuentas**

```ts
// ---------- Gestión de usuarios (Director) ----------

export async function crearNuevaCuenta(
  _previo: Resultado<{ id: string }> | null,
  formData: FormData,
): Promise<Resultado<{ id: string }>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const entrada = esquemaNuevaCuenta.safeParse({
    nombre: formData.get('nombre'),
    siglas: formData.get('siglas'),
    correo: formData.get('correo'),
    rol: formData.get('rol'),
    contrasena: formData.get('contrasena'),
  })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))

  const admin = crearClienteAdmin()
  const { data: existente } = await admin.from('perfiles').select('id').eq('correo', entrada.data.correo).maybeSingle()
  if (existente) return fallo(MENSAJE_REVISAR, { correo: MENSAJE_CORREO_REPETIDO })

  // crearCuenta borra el usuario de Auth si falla el perfil (spec §4).
  const resultado = await crearCuenta(admin, { ...entrada.data, debeCambiarContrasena: true })
  if (!resultado.ok) return fallo(resultado.error)

  revalidatePath('/configuraciones')
  return exito({ id: resultado.id })
}
```

- [ ] **Paso 4: Agregar al final rol, contraseña temporal y estado**

```ts
export async function cambiarRolCuenta(entrada: unknown): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const datos = esquemaCambioRol.safeParse(entrada)
  if (!datos.success) return fallo('Datos inválidos.')
  const { id, rol } = datos.data
  if (id === acceso.perfil.id) return fallo('No podés cambiar tu propio rol.')

  const { data, error } = await crearClienteAdmin().from('perfiles').update({ rol }).eq('id', id).select('id')
  if (error) return fallo(mensajeErrorPerfil(error, 'No se pudo cambiar el rol. Intentá de nuevo.'))
  if (data.length === 0) return fallo('La cuenta no existe.')

  revalidatePath('/configuraciones')
  return exito(null)
}

export async function ponerContrasenaTemporal(
  _previo: Resultado<null> | null,
  formData: FormData,
): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const entrada = esquemaContrasenaTemporal.safeParse({
    id: formData.get('id'),
    contrasena: formData.get('contrasena'),
  })
  if (!entrada.success) return fallo(MENSAJE_REVISAR, camposConError(entrada.error))
  const { id, contrasena } = entrada.data
  if (id === acceso.perfil.id) return fallo('Tu propia contraseña se cambia en "Mi cuenta".')

  const admin = crearClienteAdmin()
  const { data: cuenta } = await admin.from('perfiles').select('debe_cambiar_contrasena').eq('id', id).maybeSingle()
  if (!cuenta) return fallo('La cuenta no existe.')

  // Primero la marca: nunca queda una contraseña conocida por el Director sin cambio obligatorio.
  const { error: errorMarca } = await admin.from('perfiles').update({ debe_cambiar_contrasena: true }).eq('id', id)
  if (errorMarca) return fallo('No se pudo poner la contraseña temporal. Intentá de nuevo.')

  // Con el cliente admin, Auth cierra además todas las sesiones abiertas de esa persona.
  const { error } = await admin.auth.admin.updateUserById(id, { password: contrasena })
  if (error) {
    await admin.from('perfiles').update({ debe_cambiar_contrasena: cuenta.debe_cambiar_contrasena }).eq('id', id)
    if (error.code === 'weak_password') {
      return fallo(MENSAJE_REVISAR, { contrasena: 'La contraseña es demasiado débil. Probá con una más larga.' })
    }
    return fallo('No se pudo poner la contraseña temporal. Intentá de nuevo.')
  }

  revalidatePath('/configuraciones')
  return exito(null)
}

export async function cambiarEstadoCuenta(entrada: unknown): Promise<Resultado<null>> {
  const acceso = await perfilParaAccion('director')
  if (!acceso.ok) return acceso

  const datos = esquemaEstadoCuenta.safeParse(entrada)
  if (!datos.success) return fallo('Datos inválidos.')
  const { id, activo } = datos.data
  if (id === acceso.perfil.id) return fallo('No podés desactivar tu propia cuenta.')

  const admin = crearClienteAdmin()
  const verbo = activo ? 'reactivar' : 'desactivar'

  // Spec §4, en este orden: 1) perfiles.activo (el trigger MOL02 puede rechazarlo), 2) bloqueo en Auth.
  const { data, error } = await admin.from('perfiles').update({ activo }).eq('id', id).select('id')
  if (error) return fallo(mensajeErrorPerfil(error, `No se pudo ${verbo} la cuenta. Intentá de nuevo.`))
  if (data.length === 0) return fallo('La cuenta no existe.')

  const { error: errorAuth } = await admin.auth.admin.updateUserById(id, {
    ban_duration: activo ? 'none' : DURACION_BLOQUEO,
  })
  if (errorAuth) {
    // Si el bloqueo falla, se revierte `activo` (spec §4).
    await admin.from('perfiles').update({ activo: !activo }).eq('id', id)
    return fallo(`No se pudo ${verbo} la cuenta. Intentá de nuevo.`)
  }

  revalidatePath('/configuraciones')
  return exito(null)
}
```

- [ ] **Paso 5: Verificar tipos y lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores.

- [ ] **Paso 6: Commit**

```bash
git add "app/(app)/configuraciones/acciones.ts"
git commit -m "feat: acciones de Mi cuenta, horas límite y gestión de usuarios"
```

---

### Tarea 7: Estilos de la sección y aviso de resultado

**Archivos:**
- Modificar: `app/globals.css`
- Crear: `app/(app)/configuraciones/_componentes/usar-aviso-resultado.ts`

- [ ] **Paso 1: Agregar estilos al final de `app/globals.css`**

Se reutilizan `.settings-section`, `.settings-grid`, `.user-table`, `.field`, `.hint`, `.btn`, `.role-pill`, `.modal-foot` y `.campo-error`. Solo se agrega lo que el prototipo no tiene:

```css
/* ---------- Configuraciones (pista 05) ---------- */
.subtitulo-seccion{font-size:15px;margin:22px 0 10px;}
.acciones-formulario{display:flex;gap:8px;margin-top:14px;}
.horas-limite-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
@media (max-width:700px){.horas-limite-grid{grid-template-columns:1fr;}}
.hora-limite{border:none;padding:0;margin:0;min-width:0;}
.hora-limite legend{font-family:var(--font-display);font-weight:600;font-size:15px;margin-bottom:10px;padding:0;}
.tabla-desplazable{overflow-x:auto;}
.user-table select{padding:6px 8px;background:var(--bg);border:1px solid var(--line);border-radius:var(--radius);color:var(--ink);font-size:13px;}
.user-table select:disabled{opacity:0.6;cursor:not-allowed;}
.user-table tr.inactiva td{color:var(--ink-faint);}
.acciones-cuenta{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end;}
.contrasena-generada{display:flex;gap:8px;}
.contrasena-generada .btn{flex-shrink:0;}
.clave-temporal{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:17px;letter-spacing:0.04em;background:var(--surface-2);padding:10px 12px;border-radius:var(--radius);margin:12px 0;user-select:all;}
```

- [ ] **Paso 2: `app/(app)/configuraciones/_componentes/usar-aviso-resultado.ts`**

```ts
import { useEffect } from 'react'
import { useAviso } from '@/components/ui/avisos'
import type { Resultado } from '@/lib/acciones/resultado'

/**
 * Spec §9.1: éxito y errores generales como aviso emergente;
 * los errores de validación (`campos`) se muestran junto a cada campo.
 */
export function useAvisoDeResultado<T>(estado: Resultado<T> | null, textoExito: string | null) {
  const aviso = useAviso()
  useEffect(() => {
    if (!estado) return
    if (estado.ok) {
      if (textoExito) aviso(textoExito)
    } else if (!estado.campos) {
      aviso(estado.error)
    }
  }, [estado, aviso, textoExito])
}
```

- [ ] **Paso 3: Verificar lint y commitear**

```bash
npm run lint
git add app/globals.css "app/(app)/configuraciones/_componentes/usar-aviso-resultado.ts"
git commit -m "feat(ui): estilos de Configuraciones y aviso de resultado de acciones"
```

Esperado: lint sin errores.

---
### Tarea 8: Sección "Mi cuenta"

**Archivos:**
- Crear: `app/(app)/configuraciones/_componentes/formulario-mi-cuenta.tsx`, `app/(app)/configuraciones/_componentes/formulario-mi-contrasena.tsx`, `app/(app)/configuraciones/_componentes/seccion-mi-cuenta.tsx`

- [ ] **Paso 1: `formulario-mi-cuenta.tsx`**

Inputs controlados: React 19 resetea el formulario después de la acción, y así un error (por ejemplo, correo repetido) no borra lo escrito.

```tsx
'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { ETIQUETA_ROL, ROLES, type Rol } from '@/lib/perfiles/roles'
import { guardarMiCuenta } from '../acciones'
import { useAvisoDeResultado } from './usar-aviso-resultado'

export function FormularioMiCuenta(props: { nombre: string; siglas: string; correo: string; rol: Rol }) {
  const [estado, accion] = useActionState(guardarMiCuenta, null)
  const [nombre, setNombre] = useState(props.nombre)
  const [siglas, setSiglas] = useState(props.siglas)
  const [correo, setCorreo] = useState(props.correo)
  const campos = estado && !estado.ok ? estado.campos : undefined
  useAvisoDeResultado(estado, 'Cuenta actualizada.')

  return (
    <form action={accion} noValidate>
      <div className="settings-grid card">
        <div className="field">
          <label htmlFor="mi-nombre">Nombre</label>
          <input
            id="mi-nombre"
            name="nombre"
            autoComplete="name"
            required
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
          {campos?.nombre && <div className="campo-error">{campos.nombre}</div>}
        </div>
        <div className="field">
          <label htmlFor="mi-siglas">Siglas</label>
          <input
            id="mi-siglas"
            name="siglas"
            maxLength={6}
            required
            value={siglas}
            onChange={(e) => setSiglas(e.target.value)}
          />
          {campos?.siglas && <div className="campo-error">{campos.siglas}</div>}
        </div>
        <div className="field">
          <label htmlFor="mi-correo">Correo</label>
          <input
            id="mi-correo"
            name="correo"
            type="email"
            autoComplete="email"
            required
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
          />
          <div className="hint">Es el correo con el que iniciás sesión.</div>
          {campos?.correo && <div className="campo-error">{campos.correo}</div>}
        </div>
        <div className="field">
          <label htmlFor="mi-rol">Rol</label>
          <select id="mi-rol" defaultValue={props.rol} disabled>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </select>
          <div className="hint">
            No podés cambiar tu propio rol.
            {props.rol === 'director' && ' Podés cambiar el rol de otras cuentas más abajo.'}
          </div>
        </div>
      </div>
      <div className="acciones-formulario">
        <BotonEnvio>Guardar cambios</BotonEnvio>
      </div>
    </form>
  )
}
```

- [ ] **Paso 2: `formulario-mi-contrasena.tsx`**

Sin controlar: después de cada envío los campos de contraseña quedan vacíos.

```tsx
'use client'

import { useActionState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { cambiarMiContrasena } from '../acciones'
import { useAvisoDeResultado } from './usar-aviso-resultado'

export function FormularioMiContrasena() {
  const [estado, accion] = useActionState(cambiarMiContrasena, null)
  const campos = estado && !estado.ok ? estado.campos : undefined
  useAvisoDeResultado(estado, 'Contraseña actualizada.')

  return (
    <form action={accion} noValidate>
      <div className="settings-grid card">
        <div className="field">
          <label htmlFor="contrasena-actual">Contraseña actual</label>
          <input id="contrasena-actual" name="actual" type="password" autoComplete="current-password" required />
          {campos?.actual && <div className="campo-error">{campos.actual}</div>}
        </div>
        <div className="field">
          <label htmlFor="contrasena-nueva">Contraseña nueva</label>
          <input
            id="contrasena-nueva"
            name="nueva"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          <div className="hint">Al menos 8 caracteres.</div>
          {campos?.nueva && <div className="campo-error">{campos.nueva}</div>}
        </div>
        <div className="field">
          <label htmlFor="contrasena-confirmacion">Repetir contraseña</label>
          <input
            id="contrasena-confirmacion"
            name="confirmacion"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
          {campos?.confirmacion && <div className="campo-error">{campos.confirmacion}</div>}
        </div>
      </div>
      <div className="acciones-formulario">
        <BotonEnvio>Cambiar contraseña</BotonEnvio>
      </div>
    </form>
  )
}
```

- [ ] **Paso 3: `seccion-mi-cuenta.tsx` (Server Component)**

```tsx
import type { Perfil } from '@/lib/auth/sesion'
import { FormularioMiContrasena } from './formulario-mi-contrasena'
import { FormularioMiCuenta } from './formulario-mi-cuenta'

export function SeccionMiCuenta({ perfil }: { perfil: Perfil }) {
  return (
    <section className="settings-section" aria-labelledby="titulo-mi-cuenta">
      <h2 id="titulo-mi-cuenta">Mi cuenta</h2>
      <div className="desc">Editá tu información personal.</div>
      <FormularioMiCuenta nombre={perfil.nombre} siglas={perfil.siglas} correo={perfil.correo} rol={perfil.rol} />
      <h3 className="subtitulo-seccion">Cambiar contraseña</h3>
      <FormularioMiContrasena />
    </section>
  )
}
```

- [ ] **Paso 4: Verificar tipos y lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores.

- [ ] **Paso 5: Commit**

```bash
git add "app/(app)/configuraciones/_componentes"
git commit -m "feat(configuraciones): sección Mi cuenta con perfil y contraseña propios"
```

---

### Tarea 9: Sección "Horas límite"

**Archivos:**
- Crear: `app/(app)/configuraciones/_componentes/formulario-horas-limite.tsx`, `app/(app)/configuraciones/_componentes/seccion-horas-limite.tsx`

- [ ] **Paso 1: `formulario-horas-limite.tsx`**

Cada comida es un `fieldset` con `legend`: las pruebas lo ubican con `getByRole('group', { name: 'Almuerzo' })`. El texto "Vigente: …" sale de las props (lo guardado), no de lo que se está editando.

```tsx
'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import {
  ETIQUETA_TIEMPO,
  TIEMPOS_COMIDA,
  type HoraLimite,
  type HorasLimite,
  type TiempoComida,
} from '@/lib/comidas/tipos'
import { describirCierre } from '@/lib/configuraciones/horas-limite'
import { guardarHorasLimite } from '../acciones'
import { useAvisoDeResultado } from './usar-aviso-resultado'

export function FormularioHorasLimite({ horas }: { horas: HorasLimite }) {
  const [estado, accion] = useActionState(guardarHorasLimite, null)
  const [valores, setValores] = useState<HorasLimite>(horas)
  const campos = estado && !estado.ok ? estado.campos : undefined
  useAvisoDeResultado(estado, 'Horas límite actualizadas.')

  function cambiar(comida: TiempoComida, cambio: Partial<HoraLimite>) {
    setValores((previos) => {
      const siguientes: HorasLimite = { ...previos }
      siguientes[comida] = { ...previos[comida], ...cambio }
      return siguientes
    })
  }

  return (
    <form action={accion} noValidate>
      <div className="card">
        <div className="horas-limite-grid">
          {TIEMPOS_COMIDA.map((comida) => (
            <fieldset key={comida} className="hora-limite">
              <legend>{ETIQUETA_TIEMPO[comida]}</legend>
              <div className="field">
                <label htmlFor={`${comida}_dia`}>Día</label>
                <select
                  id={`${comida}_dia`}
                  name={`${comida}_dia`}
                  value={String(valores[comida].diaRelativo)}
                  onChange={(e) => cambiar(comida, { diaRelativo: e.target.value === '-1' ? -1 : 0 })}
                >
                  <option value="0">Mismo día</option>
                  <option value="-1">Día anterior</option>
                </select>
                {campos?.[`${comida}_dia`] && <div className="campo-error">{campos[`${comida}_dia`]}</div>}
              </div>
              <div className="field">
                <label htmlFor={`${comida}_hora`}>Hora</label>
                <input
                  id={`${comida}_hora`}
                  name={`${comida}_hora`}
                  type="time"
                  required
                  value={valores[comida].hora}
                  onChange={(e) => cambiar(comida, { hora: e.target.value })}
                />
                {campos?.[`${comida}_hora`] && <div className="campo-error">{campos[`${comida}_hora`]}</div>}
              </div>
              <div className="hint">Vigente: {describirCierre(horas[comida])}</div>
            </fieldset>
          ))}
        </div>
      </div>
      <div className="acciones-formulario">
        <BotonEnvio>Guardar horas límite</BotonEnvio>
      </div>
    </form>
  )
}
```

- [ ] **Paso 2: `seccion-horas-limite.tsx` (Server Component)**

```tsx
import type { HorasLimite } from '@/lib/comidas/tipos'
import { FormularioHorasLimite } from './formulario-horas-limite'

export function SeccionHorasLimite({ horas }: { horas: HorasLimite }) {
  return (
    <section className="settings-section" aria-labelledby="titulo-horas-limite">
      <h2 id="titulo-horas-limite">Horas límite</h2>
      <div className="desc">
        Cada comida se puede cambiar hasta su hora límite, el mismo día o el día anterior. Un cambio solo afecta a las
        comidas que todavía están abiertas: las que ya cerraron no se reabren, y si la nueva hora ya pasó, la comida se
        bloquea de inmediato.
      </div>
      <FormularioHorasLimite horas={horas} />
    </section>
  )
}
```

- [ ] **Paso 3: Verificar tipos y lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add "app/(app)/configuraciones/_componentes"
git commit -m "feat(configuraciones): sección Horas límite para el Director"
```

---

### Tarea 10: Campo de contraseña temporal y modal "Nueva cuenta"

**Archivos:**
- Crear: `app/(app)/configuraciones/_componentes/campo-contrasena-temporal.tsx`, `app/(app)/configuraciones/_componentes/modal-nueva-cuenta.tsx`

- [ ] **Paso 1: `campo-contrasena-temporal.tsx`**

El input es de texto (no `password`): el Director tiene que ver la contraseña para entregarla.

```tsx
'use client'

import { generarContrasenaTemporal } from '@/lib/cuentas/contrasena-temporal'

export function CampoContrasenaTemporal({
  valor,
  alCambiar,
  error,
}: {
  valor: string
  alCambiar: (valor: string) => void
  error?: string
}) {
  return (
    <div className="field">
      <label htmlFor="contrasena-temporal">Contraseña temporal</label>
      <div className="contrasena-generada">
        <input
          id="contrasena-temporal"
          name="contrasena"
          type="text"
          autoComplete="off"
          spellCheck={false}
          minLength={8}
          required
          value={valor}
          onChange={(e) => alCambiar(e.target.value)}
        />
        <button type="button" className="btn ghost" onClick={() => alCambiar(generarContrasenaTemporal())}>
          Generar
        </button>
      </div>
      <div className="hint">Escribila o generala. Al iniciar sesión, la persona deberá elegir una nueva.</div>
      {error && <div className="campo-error">{error}</div>}
    </div>
  )
}

/** Paso final de los modales: muestra la contraseña para entregarla en persona. */
export function ContrasenaParaEntregar({
  mensaje,
  contrasena,
  alCerrar,
}: {
  mensaje: string
  contrasena: string
  alCerrar: () => void
}) {
  return (
    <>
      <p role="status">{mensaje}</p>
      <div className="clave-temporal">{contrasena}</div>
      <p className="hint">
        Entregala en persona; no se vuelve a mostrar. La app no envía correos: al iniciar sesión se pedirá elegir una
        contraseña nueva.
      </p>
      <div className="modal-foot">
        <button type="button" className="btn" onClick={alCerrar}>
          Listo
        </button>
      </div>
    </>
  )
}
```

- [ ] **Paso 2: `modal-nueva-cuenta.tsx`**

`Modal` devuelve `null` cerrado, así que el formulario se desmonta y cada apertura empieza vacía.

```tsx
'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { Modal } from '@/components/ui/modal'
import { ETIQUETA_ROL, ROLES, type Rol } from '@/lib/perfiles/roles'
import { crearNuevaCuenta } from '../acciones'
import { CampoContrasenaTemporal, ContrasenaParaEntregar } from './campo-contrasena-temporal'
import { useAvisoDeResultado } from './usar-aviso-resultado'

export function ModalNuevaCuenta({ abierto, alCerrar }: { abierto: boolean; alCerrar: () => void }) {
  return (
    <Modal titulo="Nueva cuenta" abierto={abierto} alCerrar={alCerrar}>
      <FormularioNuevaCuenta alCerrar={alCerrar} />
    </Modal>
  )
}

function FormularioNuevaCuenta({ alCerrar }: { alCerrar: () => void }) {
  const [estado, accion] = useActionState(crearNuevaCuenta, null)
  const [nombre, setNombre] = useState('')
  const [siglas, setSiglas] = useState('')
  const [correo, setCorreo] = useState('')
  const [rol, setRol] = useState<Rol>('residente')
  const [contrasena, setContrasena] = useState('')
  const campos = estado && !estado.ok ? estado.campos : undefined
  useAvisoDeResultado(estado, null)

  if (estado?.ok) {
    return (
      <ContrasenaParaEntregar
        mensaje={`Cuenta creada para ${nombre.trim()} (${correo.trim().toLowerCase()}).`}
        contrasena={contrasena}
        alCerrar={alCerrar}
      />
    )
  }

  return (
    <form action={accion} noValidate>
      <div className="field">
        <label htmlFor="nueva-nombre">Nombre completo</label>
        <input id="nueva-nombre" name="nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
        {campos?.nombre && <div className="campo-error">{campos.nombre}</div>}
      </div>
      <div className="field">
        <label htmlFor="nueva-siglas">Siglas</label>
        <input
          id="nueva-siglas"
          name="siglas"
          maxLength={6}
          required
          value={siglas}
          onChange={(e) => setSiglas(e.target.value)}
        />
        {campos?.siglas && <div className="campo-error">{campos.siglas}</div>}
      </div>
      <div className="field">
        <label htmlFor="nueva-correo">Correo</label>
        <input
          id="nueva-correo"
          name="correo"
          type="email"
          autoComplete="off"
          required
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
        />
        {campos?.correo && <div className="campo-error">{campos.correo}</div>}
      </div>
      <div className="field">
        <label htmlFor="nueva-rol">Rol</label>
        <select id="nueva-rol" name="rol" value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ETIQUETA_ROL[r]}
            </option>
          ))}
        </select>
        {campos?.rol && <div className="campo-error">{campos.rol}</div>}
      </div>
      <CampoContrasenaTemporal valor={contrasena} alCambiar={setContrasena} error={campos?.contrasena} />
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={alCerrar}>
          Cancelar
        </button>
        <BotonEnvio textoPendiente="Creando…">Crear cuenta</BotonEnvio>
      </div>
    </form>
  )
}
```

- [ ] **Paso 3: Verificar tipos y lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores.

- [ ] **Paso 4: Commit**

```bash
git add "app/(app)/configuraciones/_componentes"
git commit -m "feat(configuraciones): modal de nueva cuenta con contraseña temporal"
```

---
### Tarea 11: Fila de cuenta, contraseña temporal y confirmación de desactivación

**Archivos:**
- Crear: `app/(app)/configuraciones/_componentes/modal-contrasena-temporal.tsx`, `app/(app)/configuraciones/_componentes/modal-desactivar-cuenta.tsx`, `app/(app)/configuraciones/_componentes/fila-cuenta.tsx`

- [ ] **Paso 1: `modal-contrasena-temporal.tsx`**

```tsx
'use client'

import { useActionState, useState } from 'react'
import { BotonEnvio } from '@/components/ui/boton-envio'
import { Modal } from '@/components/ui/modal'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { ponerContrasenaTemporal } from '../acciones'
import { CampoContrasenaTemporal, ContrasenaParaEntregar } from './campo-contrasena-temporal'
import { useAvisoDeResultado } from './usar-aviso-resultado'

export function ModalContrasenaTemporal({ cuenta, alCerrar }: { cuenta: Cuenta | null; alCerrar: () => void }) {
  return (
    <Modal titulo="Contraseña temporal" abierto={cuenta !== null} alCerrar={alCerrar}>
      {cuenta && <FormularioContrasenaTemporal cuenta={cuenta} alCerrar={alCerrar} />}
    </Modal>
  )
}

function FormularioContrasenaTemporal({ cuenta, alCerrar }: { cuenta: Cuenta; alCerrar: () => void }) {
  const [estado, accion] = useActionState(ponerContrasenaTemporal, null)
  const [contrasena, setContrasena] = useState('')
  const campos = estado && !estado.ok ? estado.campos : undefined
  useAvisoDeResultado(estado, null)

  if (estado?.ok) {
    return (
      <ContrasenaParaEntregar
        mensaje={`Contraseña temporal asignada a ${cuenta.nombre}.`}
        contrasena={contrasena}
        alCerrar={alCerrar}
      />
    )
  }

  return (
    <form action={accion} noValidate>
      <p className="hint">
        {cuenta.nombre} ({cuenta.correo}) deberá elegir una contraseña nueva la próxima vez que inicie sesión.
      </p>
      <input type="hidden" name="id" value={cuenta.id} />
      <CampoContrasenaTemporal valor={contrasena} alCambiar={setContrasena} error={campos?.contrasena} />
      <div className="modal-foot">
        <button type="button" className="btn ghost" onClick={alCerrar}>
          Cancelar
        </button>
        <BotonEnvio>Guardar contraseña</BotonEnvio>
      </div>
    </form>
  )
}
```

- [ ] **Paso 2: `modal-desactivar-cuenta.tsx`**

```tsx
'use client'

import { useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import { Modal } from '@/components/ui/modal'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { cambiarEstadoCuenta } from '../acciones'

export function ModalDesactivarCuenta({ cuenta, alCerrar }: { cuenta: Cuenta | null; alCerrar: () => void }) {
  const aviso = useAviso()
  const [pendiente, iniciarTransicion] = useTransition()

  function confirmar() {
    if (!cuenta) return
    iniciarTransicion(async () => {
      const resultado = await cambiarEstadoCuenta({ id: cuenta.id, activo: false })
      aviso(resultado.ok ? `Cuenta desactivada: ${cuenta.nombre}.` : resultado.error)
      alCerrar()
    })
  }

  return (
    <Modal titulo="Desactivar cuenta" abierto={cuenta !== null} alCerrar={alCerrar}>
      {cuenta && (
        <>
          <p>
            ¿Desactivar la cuenta de <strong>{cuenta.nombre}</strong>?
          </p>
          <p className="hint">
            No podrá iniciar sesión, no aparecerá en las comidas ni recibirá avisos. Sus mensajes se conservan y podés
            reactivarla cuando quieras.
          </p>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={alCerrar} disabled={pendiente}>
              Cancelar
            </button>
            <button type="button" className="btn danger" onClick={confirmar} disabled={pendiente}>
              {pendiente ? 'Desactivando…' : 'Desactivar'}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
```

- [ ] **Paso 3: `fila-cuenta.tsx`**

El rol usa `useOptimistic`: el select cambia al instante y, al terminar la acción, toma el valor del servidor (el nuevo si salió bien, el anterior si falló).

```tsx
'use client'

import { useOptimistic, useTransition } from 'react'
import { useAviso } from '@/components/ui/avisos'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { ETIQUETA_ROL, ROLES, type Rol } from '@/lib/perfiles/roles'
import { cambiarEstadoCuenta, cambiarRolCuenta } from '../acciones'

export function FilaCuenta({
  cuenta,
  esPropia,
  alPonerContrasena,
  alDesactivar,
}: {
  cuenta: Cuenta
  esPropia: boolean
  alPonerContrasena: () => void
  alDesactivar: () => void
}) {
  const aviso = useAviso()
  const [rol, setRolOptimista] = useOptimistic(cuenta.rol)
  const [pendiente, iniciarTransicion] = useTransition()

  function cambiarRol(nuevo: Rol) {
    iniciarTransicion(async () => {
      setRolOptimista(nuevo)
      const resultado = await cambiarRolCuenta({ id: cuenta.id, rol: nuevo })
      aviso(resultado.ok ? `Rol actualizado para ${cuenta.nombre}.` : resultado.error)
    })
  }

  function reactivar() {
    iniciarTransicion(async () => {
      const resultado = await cambiarEstadoCuenta({ id: cuenta.id, activo: true })
      aviso(resultado.ok ? `Cuenta reactivada: ${cuenta.nombre}.` : resultado.error)
    })
  }

  return (
    <tr className={cuenta.activo ? undefined : 'inactiva'}>
      <td>
        {cuenta.nombre} <span className="role-pill">{cuenta.siglas}</span>
        {esPropia && <div className="hint">Tu cuenta</div>}
      </td>
      <td>{cuenta.correo}</td>
      <td>
        <select
          aria-label={`Rol de ${cuenta.nombre}`}
          value={rol}
          disabled={esPropia || pendiente}
          onChange={(e) => cambiarRol(e.target.value as Rol)}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ETIQUETA_ROL[r]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <span className="role-pill">{cuenta.activo ? 'Activa' : 'Desactivada'}</span>
        {cuenta.debe_cambiar_contrasena && <div className="hint">Cambio de contraseña pendiente</div>}
      </td>
      <td>
        {!esPropia && (
          <div className="acciones-cuenta">
            <button type="button" className="btn ghost small" onClick={alPonerContrasena} disabled={pendiente}>
              Contraseña temporal
            </button>
            {cuenta.activo ? (
              <button type="button" className="btn ghost small" onClick={alDesactivar} disabled={pendiente}>
                Desactivar
              </button>
            ) : (
              <button type="button" className="btn small" onClick={reactivar} disabled={pendiente}>
                Reactivar
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}
```

- [ ] **Paso 4: Verificar tipos y lint**

```bash
npm run typecheck && npm run lint
```

Esperado: sin errores.

- [ ] **Paso 5: Commit**

```bash
git add "app/(app)/configuraciones/_componentes"
git commit -m "feat(configuraciones): fila de cuenta con rol, contraseña temporal y estado"
```

---

### Tarea 12: Sección "Gestión de usuarios", página y pantalla de error

**Archivos:**
- Crear: `app/(app)/configuraciones/_componentes/seccion-gestion-usuarios.tsx`, `app/(app)/configuraciones/error.tsx`
- Modificar: `app/(app)/configuraciones/page.tsx` (reemplazo completo de la provisional)

- [ ] **Paso 1: `seccion-gestion-usuarios.tsx`**

`alCerrar` se memoriza con `useCallback` porque `Modal` lo usa en las dependencias de su efecto.

```tsx
'use client'

import { useCallback, useState } from 'react'
import type { Cuenta } from '@/lib/configuraciones/tipos'
import { FilaCuenta } from './fila-cuenta'
import { ModalContrasenaTemporal } from './modal-contrasena-temporal'
import { ModalDesactivarCuenta } from './modal-desactivar-cuenta'
import { ModalNuevaCuenta } from './modal-nueva-cuenta'

export function SeccionGestionUsuarios({ cuentas, idPropio }: { cuentas: Cuenta[]; idPropio: string }) {
  const [creando, setCreando] = useState(false)
  const [conContrasena, setConContrasena] = useState<Cuenta | null>(null)
  const [aDesactivar, setADesactivar] = useState<Cuenta | null>(null)

  const cerrarCreacion = useCallback(() => setCreando(false), [])
  const cerrarContrasena = useCallback(() => setConContrasena(null), [])
  const cerrarDesactivacion = useCallback(() => setADesactivar(null), [])

  return (
    <section className="settings-section" aria-labelledby="titulo-gestion-usuarios">
      <h2 id="titulo-gestion-usuarios">Gestión de usuarios</h2>
      <div className="desc">
        Creá cuentas, asigná roles, poné contraseñas temporales y desactivá o reactivá cuentas. Cada persona edita su
        propio nombre, siglas y correo.
      </div>
      <div className="card">
        <div className="tabla-desplazable">
          <table className="user-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {cuentas.map((cuenta) => (
                <FilaCuenta
                  key={cuenta.id}
                  cuenta={cuenta}
                  esPropia={cuenta.id === idPropio}
                  alPonerContrasena={() => setConContrasena(cuenta)}
                  alDesactivar={() => setADesactivar(cuenta)}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="acciones-formulario">
          <button type="button" className="btn ghost" onClick={() => setCreando(true)}>
            + Nueva cuenta
          </button>
        </div>
      </div>
      <ModalNuevaCuenta abierto={creando} alCerrar={cerrarCreacion} />
      <ModalContrasenaTemporal cuenta={conContrasena} alCerrar={cerrarContrasena} />
      <ModalDesactivarCuenta cuenta={aDesactivar} alCerrar={cerrarDesactivacion} />
    </section>
  )
}
```

- [ ] **Paso 2: Reemplazar `app/(app)/configuraciones/page.tsx`**

El orden de las secciones es un **contrato** con la pista 06-B (índice §4): no mover el comentario marcado.

```tsx
import { exigirPerfil } from '@/lib/auth/sesion'
import { listarCuentas, obtenerHorasLimite } from '@/lib/configuraciones/consultas'
import { SeccionGestionUsuarios } from './_componentes/seccion-gestion-usuarios'
import { SeccionHorasLimite } from './_componentes/seccion-horas-limite'
import { SeccionMiCuenta } from './_componentes/seccion-mi-cuenta'

export default async function PaginaConfiguraciones() {
  const perfil = await exigirPerfil()
  const esDirector = perfil.rol === 'director'
  const [horas, cuentas] = esDirector ? await Promise.all([obtenerHorasLimite(), listarCuentas()]) : [null, null]

  return (
    <>
      <div className="page-head">
        <h1>Configuraciones</h1>
        <div className="desc">Información de tu cuenta y opciones del sistema.</div>
      </div>

      {/* 1. Mi cuenta (todos los roles) */}
      <SeccionMiCuenta perfil={perfil} />

      {/* CONTRATO pista 06-B (índice §4): insertar aquí <SeccionNotificaciones />, después de "Mi cuenta" y antes de las secciones del Director. */}

      {/* 2. Horas límite (solo Director) */}
      {esDirector && horas && <SeccionHorasLimite horas={horas} />}

      {/* 3. Gestión de usuarios (solo Director) */}
      {esDirector && cuentas && <SeccionGestionUsuarios cuentas={cuentas} idPropio={perfil.id} />}
    </>
  )
}
```

- [ ] **Paso 3: `app/(app)/configuraciones/error.tsx`**

```tsx
'use client'

export default function ErrorConfiguraciones({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <div className="page-head">
        <h1>Configuraciones</h1>
      </div>
      <div className="card">
        <div className="empty-state">
          <p>No se pudo cargar esta sección.</p>
          <div className="acciones-formulario" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn" onClick={reset}>
              Reintentar
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Paso 4: Verificar build, tipos y lint**

```bash
npm run typecheck && npm run lint && npm run build
```

Esperado: sin errores; `/configuraciones` aparece como ruta dinámica (ƒ).

- [ ] **Paso 5: Commit**

```bash
git add "app/(app)/configuraciones"
git commit -m "feat(configuraciones): gestión de usuarios y página completa por rol"
```

---
### Tarea 13: Revisión manual contra el proyecto (solo antes del lanzamiento)

> El único proyecto de Supabase es **producción** (spec §10). Hacer esta tarea solo mientras el centro todavía no usa la app, y solo con cuentas `@demo.test`. Después del lanzamiento, saltarla: la verificación queda a cargo de las e2e en CI (tarea 14).

**Archivos:** ninguno (sin commit).

- [ ] **Paso 1: Levantar la app con datos demo**

```bash
npm run datos-demo -- --confirmar
npm run dev
```

Esperado: `Listo. Contraseña de todas las cuentas demo: demo-molino-2026` y la app en `http://localhost:3000`.

- [ ] **Paso 2: Residente**

Entrar con `residente@demo.test` / `demo-molino-2026` e ir a Configuraciones:
- solo aparece "Mi cuenta": no están "Horas límite" ni "Gestión de usuarios";
- el select "Rol" está deshabilitado y dice "No podés cambiar tu propio rol.";
- cambiar las siglas a `jx` y guardar → aviso "Cuenta actualizada." y el avatar de la barra lateral muestra `JX`;
- volver a poner `JP` y guardar;
- en "Cambiar contraseña", poner una actual incorrecta → aparece "La contraseña actual no es correcta." junto al campo.

- [ ] **Paso 3: Director**

Cerrar sesión y entrar con `director@demo.test`:
- **Horas límite:**
  - cambiar Cena a `16:30` y guardar → "Vigente: cierra el mismo día a las 16:30";
  - **volver a `16:00`** y guardar (las horas límite son compartidas por todo el proyecto).
- **Crear cuenta:**
  - "+ Nueva cuenta" con Nombre `Prueba Manual (demo)`, Siglas `PM`, Correo `prueba-manual@demo.test`, Rol Residente;
  - "Generar" y "Crear cuenta" → se muestra la contraseña para entregar;
  - en una ventana privada, entrar con ese correo y esa contraseña → redirige a `/cambiar-contrasena`.
- **Rol propio:** en la tabla, el select de la fila propia está deshabilitado y no hay botón "Desactivar".
- **Desactivar y reactivar:**
  - "Desactivar" en `Prueba Manual (demo)` y confirmar → estado "Desactivada";
  - en la ventana privada, intentar entrar → "Tu cuenta está desactivada. Hablá con el Director.";
  - "Reactivar" → estado "Activa".

- [ ] **Paso 4: Dejar el proyecto como estaba**

- Horas límite: desayuno día anterior 21:00, almuerzo mismo día 10:00, cena mismo día 16:00.
- La cuenta `prueba-manual@demo.test` es demo: la borra `npm run limpiar-datos-demo -- --confirmar` (checklist de lanzamiento). No hace falta borrarla ahora.

---

### Tarea 14: Pruebas de punta a punta

**Archivos:**
- Crear: `tests/e2e/configuraciones.spec.ts`

> Corren **solo en CI** (job `base-de-datos`): `tests/e2e/global-setup.ts` aborta si la base no es local.

Notas para escribir las pruebas:
- **Restauración:** `afterEach` restaura usuarios (`asegurarUsuariosPrueba`, que desde la tarea 1 incluye nombre y siglas), horas límite y borra la cuenta creada. Corre también si la prueba falla, así un reintento de CI empieza limpio.
- **Mensajes de error del login:** se buscan por texto, no con `getByRole('alert')`. Next.js agrega su propio `role="alert"` (el anunciador de rutas) y ese localizador encontraría dos elementos.

- [ ] **Paso 1: Escribir `tests/e2e/configuraciones.spec.ts`**

```ts
import { expect, test, type Page } from '@playwright/test'
import { HORAS_LIMITE_POR_DEFECTO } from '../../lib/comidas/tipos'
import {
  asegurarUsuariosPrueba,
  clienteAdminPrueba,
  CONTRASENA_PRUEBA,
  USUARIOS_PRUEBA,
  type ClaveUsuario,
} from '../soporte/usuarios-prueba'

const CORREO_CUENTA_NUEVA = 'cuenta-nueva@prueba.test'
const FORMATO_TEMPORAL = /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/

async function iniciarSesion(page: Page, correo: string, contrasena: string = CONTRASENA_PRUEBA) {
  await page.goto('/login')
  await page.getByLabel('Correo').fill(correo)
  await page.getByLabel('Contraseña').fill(contrasena)
  await page.getByRole('button', { name: 'Iniciar sesión' }).click()
}

async function abrirConfiguracionesComo(page: Page, clave: ClaveUsuario) {
  await iniciarSesion(page, USUARIOS_PRUEBA[clave].correo)
  await expect(page).toHaveURL(/\/comidas\/semana$/)
  await page.goto('/configuraciones')
  await expect(page.getByRole('heading', { name: 'Configuraciones' })).toBeVisible()
}

async function borrarCuentaNueva() {
  const admin = clienteAdminPrueba()
  const { data } = await admin.from('perfiles').select('id').eq('correo', CORREO_CUENTA_NUEVA).maybeSingle()
  if (!data) return
  const { error } = await admin.auth.admin.deleteUser(data.id)
  if (error) throw error
}

async function restaurarHorasLimite() {
  const admin = clienteAdminPrueba()
  for (const [comida, { diaRelativo, hora }] of Object.entries(HORAS_LIMITE_POR_DEFECTO)) {
    const { error } = await admin.from('horas_limite').update({ dia_relativo: diaRelativo, hora }).eq('comida', comida)
    if (error) throw error
  }
}

test.afterEach(async () => {
  await borrarCuentaNueva()
  await restaurarHorasLimite()
  await asegurarUsuariosPrueba()
})

test('un residente ve Mi cuenta pero no Horas límite ni Gestión de usuarios', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'residente')
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Horas límite' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Gestión de usuarios' })).toHaveCount(0)
  await expect(page.getByLabel('Rol', { exact: true })).toBeDisabled()
})

test('un residente cambia su nombre y lo ve en la barra lateral', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'residente')
  await page.getByLabel('Nombre', { exact: true }).fill('Residente Renombrado')
  await page.getByLabel('Siglas', { exact: true }).fill('rr')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Cuenta actualizada.')).toBeVisible()
  await expect(page.locator('.sidebar')).toContainText('Residente Renombrado')
  await expect(page.locator('.sidebar .avatar')).toHaveText('RR')
})

test('cambiar la propia contraseña pide la actual y no cierra la sesión', async ({ page }) => {
  const nueva = 'otra-clave-789'
  await abrirConfiguracionesComo(page, 'residente')

  await page.getByLabel('Contraseña actual').fill('incorrecta-000')
  await page.getByLabel('Contraseña nueva').fill(nueva)
  await page.getByLabel('Repetir contraseña').fill(nueva)
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await expect(page.getByText('La contraseña actual no es correcta.')).toBeVisible()

  // React vacía el formulario después de cada envío: se completa de nuevo.
  await page.getByLabel('Contraseña actual').fill(CONTRASENA_PRUEBA)
  await page.getByLabel('Contraseña nueva').fill(nueva)
  await page.getByLabel('Repetir contraseña').fill(nueva)
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click()
  await expect(page.getByText('Contraseña actualizada.')).toBeVisible()

  // La verificación de la actual no tocó las cookies: la sesión sigue abierta.
  await page.reload()
  await expect(page).toHaveURL(/\/configuraciones$/)
  await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible()

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await iniciarSesion(page, USUARIOS_PRUEBA.residente.correo, nueva)
  await expect(page).toHaveURL(/\/comidas\/semana$/)
})
```

- [ ] **Paso 2: Agregar al final las pruebas del Director**

```ts
test('el Director crea una cuenta con contraseña temporal y la persona debe cambiarla al entrar', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'director')
  await page.getByRole('button', { name: '+ Nueva cuenta' }).click()

  const dialogo = page.getByRole('dialog', { name: 'Nueva cuenta' })
  await dialogo.getByLabel('Nombre completo').fill('Cuenta Nueva')
  await dialogo.getByLabel('Siglas').fill('cn')
  await dialogo.getByLabel('Correo').fill(CORREO_CUENTA_NUEVA)
  await dialogo.getByLabel('Rol').selectOption('residente')
  await dialogo.getByRole('button', { name: 'Generar' }).click()
  const temporal = await dialogo.getByLabel('Contraseña temporal').inputValue()
  expect(temporal).toMatch(FORMATO_TEMPORAL)

  await dialogo.getByRole('button', { name: 'Crear cuenta' }).click()
  await expect(dialogo.getByRole('status')).toHaveText(`Cuenta creada para Cuenta Nueva (${CORREO_CUENTA_NUEVA}).`)
  await expect(dialogo).toContainText(temporal)
  await dialogo.getByRole('button', { name: 'Listo' }).click()

  const fila = page.getByRole('row', { name: /Cuenta Nueva/ })
  await expect(fila).toContainText('CN')
  await expect(fila).toContainText('Cambio de contraseña pendiente')

  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await iniciarSesion(page, CORREO_CUENTA_NUEVA, temporal)
  await expect(page).toHaveURL(/\/cambiar-contrasena$/)
})

test('el Director desactiva una cuenta, que ya no puede entrar, y la reactiva', async ({ page, browser }) => {
  await abrirConfiguracionesComo(page, 'director')
  const fila = page.getByRole('row', { name: /Residente Dos/ })

  await fila.getByRole('button', { name: 'Desactivar' }).click()
  const dialogo = page.getByRole('dialog', { name: 'Desactivar cuenta' })
  await expect(dialogo).toContainText('Residente Dos')
  await dialogo.getByRole('button', { name: 'Desactivar' }).click()
  await expect(dialogo).toBeHidden()
  await expect(fila).toContainText('Desactivada')

  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL })
  const otra = await contexto.newPage()
  await iniciarSesion(otra, USUARIOS_PRUEBA.residente2.correo)
  await expect(otra.getByText('Tu cuenta está desactivada. Hablá con el Director.')).toBeVisible()

  await fila.getByRole('button', { name: 'Reactivar' }).click()
  await expect(fila.getByText('Activa', { exact: true })).toBeVisible()

  await iniciarSesion(otra, USUARIOS_PRUEBA.residente2.correo)
  await expect(otra).toHaveURL(/\/comidas\/semana$/)
  await contexto.close()
})

test('el Director cambia el rol de otra cuenta pero no el propio', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'director')
  await expect(page.getByRole('heading', { name: 'Horas límite' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Gestión de usuarios' })).toBeVisible()

  await expect(page.getByLabel('Rol', { exact: true })).toBeDisabled()
  const propia = page.getByRole('row', { name: /Directora Prueba/ })
  await expect(propia.getByRole('combobox', { name: 'Rol de Directora Prueba' })).toBeDisabled()
  await expect(propia.getByRole('button', { name: 'Desactivar' })).toHaveCount(0)

  await page.getByRole('combobox', { name: 'Rol de Residente Dos' }).selectOption('administracion')
  await expect(page.getByText('Rol actualizado para Residente Dos.')).toBeVisible()
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Rol de Residente Dos' })).toHaveValue('administracion')
})

test('el Director cambia la hora límite del almuerzo', async ({ page }) => {
  await abrirConfiguracionesComo(page, 'director')
  const almuerzo = page.getByRole('group', { name: 'Almuerzo' })

  await almuerzo.getByLabel('Día').selectOption('0')
  await almuerzo.getByLabel('Hora').fill('11:30')
  await page.getByRole('button', { name: 'Guardar horas límite' }).click()
  await expect(page.getByText('Horas límite actualizadas.')).toBeVisible()
  await expect(almuerzo).toContainText('Vigente: cierra el mismo día a las 11:30')

  await page.reload()
  await expect(page.getByRole('group', { name: 'Almuerzo' }).getByLabel('Hora')).toHaveValue('11:30')
})
```

- [ ] **Paso 3: Verificar tipos, lint y que Playwright encuentra las pruebas**

```bash
npm run typecheck && npm run lint
npx playwright test tests/e2e/configuraciones.spec.ts --list
```

Esperado: sin errores de tipos ni de lint. `--list` no levanta el servidor ni corre el setup global, y termina con `Total: 7 tests in 1 file`.

- [ ] **Paso 4: Commit**

```bash
git add tests/e2e/configuraciones.spec.ts
git commit -m "test(e2e): configuraciones por rol, cuentas, estado, rol y horas límite"
```

---

### Tarea 15: Verificación final, PR y CI

**Archivos:** ninguno nuevo.

- [ ] **Paso 1: Verificación local completa**

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

Esperado: todo en verde. Las unitarias incluyen las 26 nuevas: 4 del generador, 16 de validación, 3 de horas límite y 3 de errores.

- [ ] **Paso 2: Actualizar con `master`**

```bash
git fetch origin && git rebase origin/master
```

Si el rebase trajo cambios, repetir el paso 1. Si `app/globals.css` tiene conflicto, conservar ambos bloques agregados al final.

- [ ] **Paso 3: Subir la rama y abrir el PR**

```bash
git push -u origin feat/configuraciones
gh pr create --base master --title "Configuraciones y gestión de usuarios" --body "Plan: docs/superpowers/plans/2026-09-16-05-configuraciones.md. Sin migraciones. Deja en app/(app)/configuraciones/page.tsx el punto de inserción de <SeccionNotificaciones /> para la pista 06-B."
```

Si la rama ya estaba subida y se hizo rebase: `git push --force-with-lease`.

- [ ] **Paso 4: Esperar CI**

```bash
gh pr checks --watch
```

Esperado: `calidad` y `base-de-datos` en verde. Las e2e de esta pista corren en `base-de-datos`.

Si falla:
- **Ver el log:** `gh run view --log-failed`.
- **Ver el reporte de Playwright:** `gh run download <id-de-la-corrida> -n playwright-report` y después `npx playwright show-report playwright-report`.
- **Error 429 o "Request rate limit reached" al iniciar sesión:**
  - Es el límite `sign_in_sign_ups` de Supabase Auth local (30 por 5 minutos por IP): en CI todos los inicios de sesión salen de 127.0.0.1.
  - **No** subirlo en `supabase/config.toml`: ese archivo se aplica a producción con `config push`.
  - Acordar con el otro colaborador un ajuste solo para CI en `.github/workflows/ci.yml`, antes de `supabase start`.
- **Corregir:** commitear y `git push`; `gh pr checks --watch` de nuevo.

- [ ] **Paso 5: Revisión y merge**

- Pedir revisión al otro colaborador.
- Al mergear, la Action de despliegue publica la app. No hay migraciones que aplicar.
- Avisar a quien lleve la pista 06 que ya existe el punto de inserción de `<SeccionNotificaciones />`.
