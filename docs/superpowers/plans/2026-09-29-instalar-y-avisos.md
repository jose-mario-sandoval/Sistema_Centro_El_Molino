# Instalar la app y avisos nuevos — plan de implementación

> **Para agentes:** SUB-SKILL REQUERIDO: usar superpowers:test-driven-development en cada tarea y
> superpowers:verification-before-completion antes de dar algo por terminado. Los pasos usan
> casillas (`- [ ]`) para el seguimiento.

**Objetivo:**
1. Que cada persona instale El Molino en su teléfono sin saber qué es una PWA: una invitación arriba
   de la app hasta que la instale, con el botón de instalar de verdad (Android/Chrome) o los pasos
   dibujados (iPhone/iPad), y al abrirla instalada, la invitación a activar los avisos.
2. Cuatro avisos push nuevos: (a) al Director, mensaje por aprobar; (b) al autor, su mensaje fue
   aprobado o no; (c) a la persona, el Director cambió algo suyo (comida, plan, ausencia); (d) a
   Administración, cambios para la cocina (extras manuales y pedidos de eventos), sin nombres ni
   títulos.
3. Arreglos chicos: una insignia monocroma para Android (`/iconos/insignia`).

**Stack:** Next.js 16 (App Router, `after()`), TypeScript, Supabase/Postgres 17 (RLS), `web-push`,
zod 4, Vitest, Playwright.

**Referencias:** spec `2026-09-16-produccion-centro-el-molino-design.md` §8 · plan
`2026-09-16-06-pwa-push.md` · checklist `2026-09-16-07-lanzamiento.md` · `DESIGN.md` · `CLAUDE.md`
(privacidad de Administración, aprobación de mensajes).

**Rama:** `claude/instalar-y-avisos` desde `master`. Migración:
`supabase/migrations/20260929120000_preferencias_avisos.sql` (hay que aplicarla a producción antes
o junto con el merge).

---

## Decisiones

### Invitación a instalar

- **Visible desde el primer pintado, sin salto ni desajuste de hidratación.** El servidor pinta la
  tarjeta (siempre el mismo HTML) solo si el `User-Agent` puede ser un teléfono o tablet (también
  "Macintosh": el iPad se presenta así); el CSS la oculta salvo que `<html>` tenga
  `data-instalar="ofrecer"`. Ese atributo lo pone un script en `<head>` antes de pintar
  (`SCRIPT_INSTALACION`, como `SCRIPT_APARIENCIA`): teléfono o tablet, no instalada (`display-mode:
  standalone` / `navigator.standalone`), sin "Ahora no" en los últimos 7 días y sin marca de
  instalada. Una prueba unitaria compara el script con la lógica en TypeScript (`debeOfrecerInstalar`)
  en todas las combinaciones. En escritorio el servidor no pinta nada: ni se ve ni estorba a las
  pruebas existentes.
- **El evento `beforeinstallprompt` se captura en ese mismo script**, antes de que cargue React: el
  navegador puede dispararlo en `/login` o antes de hidratar, y un `useEffect` lo perdería (y en
  modo estricto se montaría dos veces). El script lo guarda en `window` y lo reenvía; un almacén
  del cliente (`lib/pwa/instalacion.ts`, `useSyncExternalStore`) lo lee sin depender de montajes.
  `preventDefault()` evita la mini barra de Chrome: la invitación es la nuestra.
- **Tres variantes**, decididas por una función pura (`varianteInstalar`):
  - `nativa`: hay evento → "Instalar" llama a `prompt()`; `userChoice` rechazado no oculta nada
    (se puede volver a intentar), aceptado espera `appinstalled`.
  - `ios` (iPhone/iPad, Safari y también Chrome/Edge en iOS ≥16.4): "Instalar" despliega **en el
    lugar** (sin modal) tres pasos con dibujos: el botón Compartir (dónde está depende del aparato y
    del navegador: abajo en el iPhone con Safari, arriba en el iPad y en Chrome/Edge; si no se ve,
    tocar primero ⋯), "Agregar a pantalla de inicio" y abrir El Molino desde el ícono nuevo. "Requiere
    iOS 16.4 o posterior para los avisos."
  - `generica`: cualquier otro navegador sin API de instalación, y Chrome en Android mientras todavía
    no disparó el evento (lo hace recién después de cierta interacción): "Abrí el menú del navegador
    y elegí «Instalar app» o «Agregar a pantalla de inicio»". Cuando llega el evento pasa a `nativa`.
- **Ya instalada:** nunca se muestra en la app instalada; tras `appinstalled` queda una marca en el
  dispositivo y se muestra "Listo…" en el lugar; en Android/Chrome además
  `getInstalledRelatedApps()` (con `related_applications` apuntando al propio manifest) la oculta si
  se instaló por el menú.
- **"Ahora no"** guarda la hora en `localStorage` (con try/catch) y la oculta 7 días. Una hora en el
  futuro (reloj cambiado) no cuenta.
- **Después de instalar:** en la app instalada en un teléfono, si el permiso de notificaciones sigue
  sin pedir (`default`), hay llave VAPID y el navegador soporta push, la misma franja ofrece
  "Activá los avisos en este teléfono" con el flujo de `DispositivoPush` (`activarEsteDispositivo`:
  el permiso se pide solo al tocar). También lo decide el script de `<head>` (`data-ofrecer-avisos`),
  así que tampoco salta. Con permiso ya concedido no se insiste (si alguien los desactivó en Ajustes,
  fue a propósito); bloqueado se explica en Ajustes. "Ahora no", 7 días.
- **En Ajustes → Notificaciones**, en teléfono o tablet, una tarjeta "Instalar la app" con las mismas
  variantes (para quien tocó "Ahora no"); instalada, dice "Ya está instalada en este teléfono".
- **Accesible:** `role="region"` con nombre, título real, botones de 56px, letra nunca bajo `--t-xs`,
  icono + texto (el dibujo nunca solo), contraste alto con bordes, tema oscuro, 320px y letra enorme
  sin desbordes. Orden de foco: la franja va primero en el contenido; al desplegar los pasos, el foco
  queda en el botón (con `aria-expanded`).

### Avisos nuevos

Todos con `after()` (nunca rompen ni demoran la acción; errores al log como `lib/push/avisos.ts`),
solo a cuentas activas con suscripción, nunca a quien hizo el cambio, respetando la preferencia de
cada cuenta y con `tag` para que una ráfaga reemplace en vez de apilar.

| Aviso | Quién | Preferencia | Abre | Etiqueta |
|---|---|---|---|---|
| (a) Mensaje por aprobar (publicación, respuesta o corrección de un rechazado que queda `pendiente`) | Directores activos | `avisar_mensajes` | `/mensajes?vista=pendientes` | `mensajes-por-aprobar` (el título dice cuántos hay) |
| (b) Tu mensaje fue aprobado / no fue aprobado (con el motivo) | El autor, si no es quien moderó | `avisar_mensajes` | `/mensajes` | `moderacion-<id>` |
| (c) El Director cambió tu comida / tu plan / tu ausencia | La persona, si no es el Director que actuó | `avisar_cambios` (nuevo) | `/comidas/semana?semana=<lunes>`, `/comidas/plan`, `/calendario?mes=<mes>` | `cambio-<comida\|plan\|ausencia>-<persona>` |
| (d) Cambios para la cocina: extras manuales agregados/quitados (último momento si es hoy o ya pasó la hora límite) y pedidos de eventos nuevos/cambiados/cancelados, series en un solo aviso | Administración activa | `avisar_cocina` (nuevo) | `/comidas/semana?semana=<lunes>` o `/calendario?mes=<mes>` | `cocina-extras-<fecha>-<comida>`, `cocina-evento-<id>`, `cocina-serie-<id>` |

- (a) no toca la regla de siempre: el aviso público de un mensaje sale solo cuando está `aprobado`.
  El de (a) va solo a Directores (que pueden ver el pendiente y los nombres) y relee el estado.
- (b) relee el mensaje: solo si sigue en el estado que se moderó.
- (c) textos en segunda persona: "El Director cambió tu almuerzo del miércoles 30/9" / "Ahora: Comer
  temprano 12:00." Volver al plan relee plan y ausencia para decir cómo quedó. Plan: "El Director
  cambió tu plan de los martes" / "Almuerzo: …" (abre `/comidas/plan`, donde está la marca del
  Director). Ausencias: "El Director marcó una ausencia del 5 al 9 de octubre" / "…quitó tu
  ausencia…". Todas las fechas con `lib/fechas` (sin `Intl`).
- (d) solo fecha, comida u hora, cantidad y el pedido o nota: nunca nombres, títulos ni categorías.
  Las funciones que arman el texto reciben solo esos campos (`EventoParaCocina` sin `id`), así que
  no hay forma de colar un título. Los extras dicen el total de extras manuales de esa comida, porque
  la etiqueta por comida reemplaza el aviso anterior. Nada de fechas pasadas. Editar un evento lee
  antes el evento (una consulta por clave primaria) para saber qué cambió: solo avisa si cambió el
  pedido, la fecha o la hora; si falla esa lectura, la edición sigue igual.

### Preferencias

- Migración: `perfiles.avisar_cambios` y `perfiles.avisar_cocina`, `boolean not null default true`.
  Igual que `avisar_*`: `authenticated` solo tiene `select` de tabla (sin `update`), y la escritura
  la hace `actualizarPreferenciasAvisos` con la llave secreta después de `perfilParaAccion()`,
  siempre sobre la fila de la sesión.
- `esquemaPreferenciasAvisos`: los dos nuevos son opcionales (una pestaña abierta con la versión
  anterior sigue pudiendo guardar).
- Ajustes, por rol: Director y Residente ven "Cambios que hace el Director en mis comidas" (el
  Director, "…otro Director…"); Administración ve "Cambios para la cocina" y no ve los recordatorios.
- Límite conocido (CLAUDE.md): `perfiles` sigue legible por PostgREST para cualquier cuenta activa,
  también estas dos columnas. No se cambia acá: pasar a permisos por columna rompe
  `select('*')` de `obtenerPerfilActual`.

### Insignia

`/iconos/insignia`: 96×96, silueta blanca del escudo con la torre calada sobre transparente,
generada con `ImageResponse` (sin tocar `components/app/monograma.tsx`, que cambia en el PR #26).
`sw.js` la usa como `badge`; el `icon` sigue siendo `/iconos/192`.

---

## Tareas

- [ ] **1. Migración y tipos.** `20260929120000_preferencias_avisos.sql`; probar en el banco local
  (`banco_avisos`): columnas y valor por defecto, `authenticated` no puede actualizar `perfiles`
  (ni la propia ni la ajena). Integración en `tests/integration/push.test.ts`. Tipos editados a mano
  en el formato del generador.
- [ ] **2. Preferencias (TDD).** Validación, acción (solo la propia fila, solo lo que llega), UI por
  rol, `perfilDePrueba` y fixtures con las columnas nuevas.
- [ ] **3. Destinatarios (TDD).** `destinatariosPendiente`, `destinatarioModeracion`,
  `destinatarioCambio`, `destinatariosCocina` en `lib/push/destinatarios.ts`.
- [ ] **4. Textos (TDD).** (a) y (b) en `lib/push/mensajes-push.ts`; (c) y (d) en
  `lib/push/cargas-casa.ts`, con `lib/fechas` y `lib/comidas`; `esUltimoMomento`; qué cambió en un
  evento para la cocina (`cambioPedidoCocina`).
- [ ] **5. Envíos (TDD).** `avisarMensajePendiente`, `avisarModeracion` en `lib/push/avisos.ts`;
  `avisarCambioDelDirector`, `avisarExtraCocina`, `avisarPedidoCocina`, `avisarSerieCocina` en
  `lib/push/avisos-casa.ts`. Cliente admin falso, `enviarAUsuarios` espiado.
- [ ] **6. Acciones (TDD).** `after()` en mensajes (publicar/responder pendiente, editar rechazado,
  moderar), comidas (seleccion/volver/plan con otro objetivo), ausencias, extras y eventos (crear,
  editar, eliminar, serie, cancelar serie).
- [ ] **7. Instalación, lógica pura (TDD).** `lib/pwa/instalar.ts`: `esTelefonoOTablet`,
  `puedeSerMovil` (servidor), `varianteInstalar`, `pasosIOS`, descarte de 7 días,
  `debeOfrecerInstalar`, `debeOfrecerAvisos`, `SCRIPT_INSTALACION` (+ prueba que lo compara).
- [ ] **8. Instalación, cliente.** Almacén del evento (`lib/pwa/instalacion.ts`), `InvitacionInstalar`,
  `OfrecerAvisos`, tarjeta de Ajustes, script en `app/layout.tsx`, `related_applications` en el
  manifest, CSS (claro/oscuro/alto/enorme, 320px).
- [ ] **9. Insignia.** `app/iconos/insignia/route.tsx`, `sw.js`, e2e de rutas públicas.
- [ ] **10. E2E.** `tests/e2e/instalar.spec.ts`: franja en teléfono Android con evento sintético
  (`prompt()` espiado, `appinstalled`), "Ahora no" y recarga, nunca en escritorio, variante iOS con
  los tres pasos; preferencias por rol en Ajustes que persisten.
- [ ] **11. Verificación visual.** Banco con esbuild (como en PR anteriores): franja (3 variantes,
  pasos abiertos, listo), tarjeta de avisos y Ajustes, a 320/375/768 × claro/oscuro/alto/enorme.
- [ ] **12. Documentación.** DESIGN.md (la franja de instalar) y spec §8 (avisos nuevos).
- [ ] **13. Cierre.** lint, typecheck, unit, build; push; PR con la migración y el checklist de
  producción; CI; tipos desde el artefacto si difieren.
