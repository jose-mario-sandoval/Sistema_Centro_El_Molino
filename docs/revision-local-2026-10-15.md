# Revisión local: comidas, mensajes y ausencias

Los cambios están en los archivos locales, sin aplicar migraciones ni desplegar a producción.

## Cambios y archivos principales

- **Comidas:** Semana y Plan habitual de Administración conservan cantidades y desglose y agregan «Quiénes comen», con siglas, estado, indicación puntual y notas de dieta. Los asistentes y las cantidades se calculan desde los mismos valores efectivos; se excluyen «No comer» y «Sin definir» de la lista de quienes comen. Los extras siguen separados. Se modificaron `lib/comidas/{consultas,vista,resumen,notas}.ts`, las acciones y páginas de Plan/La casa y los componentes de Administración. Se agregaron `asistentes-administracion.tsx` y `notas-dieta.tsx`.
- **Notas de dieta:** campo opcional independiente de las comidas. Guardar vacío elimina la nota; cambiar un estado no la borra. La persona gestiona sus notas y el Director las de otras personas activas con comidas. Administración consulta, identificando solo por siglas. Persisten en `notas_dieta`, con RLS y `guardar_nota_dieta_de`.
- **Avisos:** `lib/push/{avisos,enviar,mensajes-push}.ts` y `mensajes/acciones.ts` comprueban visibilidad, moderación, preferencias y destinatarios; reservan cada evento por dispositivo antes del envío. Los enlaces abren y enfocan el hilo, incluso si es anterior a la primera página. El service worker existente conserva ese enlace y admite únicamente el origen de la app.
- **Reacciones:** consultas y modelo en `lib/mensajes`, componentes `feed-mensajes.tsx` / `tarjeta-mensaje.tsx`, acción y políticas de base admiten publicaciones y respuestas. Mantienen una reacción por persona, optimismo, tiempo real, aviso y reconciliación ante fallos. Los permisos exigen poder leer el mensaje y su publicación.
- **Ausencias:** `calendario/page.tsx` y `panel-ausencias.tsx` muestran una barra cerrada al entrar, debajo del encabezado y antes del calendario. Se abre con clic, Enter o Espacio. Plegarla conserva un formulario aún sin guardar y retira sus controles del recorrido de teclado. El uso del Director en La casa conserva la tarjeta abierta.
- También se actualizaron `app/globals.css`, validación, tipos de Supabase, pruebas y las reglas de `CLAUDE.md` / `DESIGN.md`.

## Migraciones pendientes

Aplicar, en este orden, antes o junto con publicar este código:

1. `20261015100000_notas_dieta.sql`: tabla, políticas y guardado de notas.
2. `20261015110000_avisos_mensajes_idempotentes.sql`: revisión de mensajes, reservas por evento/dispositivo y RPC exclusiva del servidor.
3. `20261015120000_reacciones_respuestas.sql`: elimina la limitación a publicaciones y refuerza lectura del mensaje y del hilo, también al responder.

Desde la raíz del repositorio, con `.env.local` configurado para el proyecto correcto (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_DB_PASSWORD`, `SUPABASE_POOLER_HOST`):

```powershell
npm run db:aplicar -- --dry-run
npm run db:aplicar
npm run db:aplicar -- --dry-run
```

Revisar **todas** las migraciones pendientes del primer comando; el último debe confirmar que no quedan pendientes. El script aplica y registra el historial sin necesitar Docker ni una sesión del CLI. No ejecutar las migraciones a mano sin registrar ese historial. El código consulta tablas y columnas nuevas, por lo que no debe publicarse antes de aplicar el esquema.

Los tipos locales ya incluyen las tablas, la columna y las RPC nuevas. El CI los vuelve a generar desde la base temporal y publica el artefacto `database-types`; comparar ese resultado. También puede usarse `npm run db:tipos` con el CLI autenticado y el proyecto vinculado correcto.

Para push siguen siendo necesarias las variables existentes `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT`, además del permiso de notificaciones y la suscripción de cada dispositivo. No se agregaron dependencias ni una configuración nueva de Realtime.

## Prueba manual por rol

Usar sesiones separadas de Director, Residente y Administración. Para las comidas, elegir fechas futuras editables y cuentas activas incluidas en los conteos.

| Cuenta | Recorrido y resultado esperado |
|---|---|
| Residente | En **Comidas → Plan de comida**, escribir notas de dieta y guardar. Recargar: permanecen. Cambiar un estado del plan o de Semana: permanecen. Vaciar y guardar: desaparecen tras recargar. Guardar un plan sin notas sigue funcionando. |
| Director | En **Comidas → La casa → persona → Su plan**, editar las notas y comprobarlas en la sesión de esa persona. Cambiar su plan, una comida puntual o sus ausencias conserva los permisos y cierres existentes. |
| Administración | En **Comidas → Semana**, abrir «Quiénes comen» de desayuno, almuerzo y cena: siglas agrupadas por estado, con sus notas si existen. El número coincide con «comen»; los extras se muestran aparte. En **Plan habitual**, comprobar que una ausencia o cambio de una semana no altera ese plan. No aparecen nombres ni controles de edición. |
| Residente y Director | En **Calendario**, comprobar que solo se ve la barra «Ausencias» al entrar. Abrir/cerrar con Enter y Espacio; marcar, cancelar y quitar con sus validaciones. Plegar un formulario a medio completar, volver a abrirlo y comprobar que conserva el rango. El calendario queda inmediatamente después de la barra cerrada. |
| Administración | En **Calendario**, comprobar que no aparece el panel de ausencias ni permite gestionarlas. |
| Todos | En **Mensajes**, poner/quitar «Me gusta» en una publicación y en una respuesta. Recargar y comprobar el resultado. Observar el contador en otra sesión. Interrumpir la conexión al reaccionar: muestra aviso y restaura/reconcilia el estado. |
| Residente y Director | Publicar/responder como Residente: queda pendiente y conserva el aviso al Director. Aprobar como Director: recién entonces reciben el aviso los destinatarios habilitados. El autor conserva su aviso de moderación y no recibe el aviso público de su propia publicación/respuesta. |
| Director y Administración | Con avisos activados en el dispositivo, publicar directamente y responder en un hilo ajeno. Comprobar que los destinatarios habilitados reciben el aviso y que al pulsarlo se abre el hilo correcto. Administración ve las siglas del autor. |
| Todos | Probar un hilo privado con otro Residente en sesión separada: no debe verlo, recibir su contenido por push, responder ni reaccionar con su UUID. Desactivar avisos de mensajes en Ajustes: ese usuario deja de recibirlos. Reintentar el mismo envío no crea otro mensaje ni repite el aviso del mismo evento/dispositivo. |

Repetir las interacciones de notas, asistentes y ausencias en un teléfono y con letra muy grande.

## Verificación realizada

| Comprobación | Resultado |
|---|---|
| `npm test` | 78 archivos, **1354 pruebas aprobadas**. |
| `npm run typecheck` | Aprobada. |
| `npm run lint` | Aprobada, sin errores ni advertencias. |
| `npm run build` | Aprobada con variables ficticias de Supabase local. El primer intento restringido no pudo descargar Google Fonts; el reintento con acceso de red completó la compilación. |
| `git diff --check` | Aprobada. |
| `npm run test:e2e -- --list` | 101 pruebas detectadas en 8 archivos; esto valida la carga de los archivos, no ejecuta los recorridos. |
| Interfaz aislada en Chrome | 16 combinaciones: ausencias y comidas/mensajes a 320, 375, 768 y 1280 px; normal y letra enorme/oscuro/alto contraste. Con las fuentes reales del build: sin desborde horizontal, controles de ausencias con mínimo táctil, teclado, foco, borrador conservado, notas vacías/guardado, siglas, optimismo, reversión ante error y evento de reacción. |
| Integración SQL y E2E con backend | Preparadas/actualizadas, **sin ejecutar**: esta máquina no dispone de Supabase local/Docker ni de sus credenciales. Ejecutar `npm run test:integracion` y `npm run test:e2e` en el entorno local/CI que ya prepara el workflow del repositorio. |

Los arneses y capturas de interfaz quedan en `test-results/` (ignorado por Git). Simulan acciones del servidor y eventos para verificar los componentes reales; no sustituyen la prueba de persistencia, RLS, Realtime real ni la entrega push a teléfonos. No se enviaron avisos a dispositivos reales.

La reserva push prioriza evitar duplicados: después de reservar un dispositivo, una falla del proveedor no se reintenta automáticamente, porque un timeout puede significar que el proveedor ya aceptó el aviso. Las fallas de configuración o consulta anteriores a la reserva sí permiten recuperarlo con un reintento. En ambos casos el mensaje guardado sigue siendo exitoso.
