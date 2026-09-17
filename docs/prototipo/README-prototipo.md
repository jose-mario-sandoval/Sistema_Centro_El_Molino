# Sistema del Centro — Centro El Molino

Documentación funcional del sistema web interno del centro. Este documento resume el contexto, las reglas de negocio acordadas, los roles y permisos, el modelo de datos y el estado actual del prototipo entregado hasta ahora.

> **Estado actual:** prototipo funcional de front-end (un único archivo HTML, sin backend), con datos de ejemplo guardados en `localStorage`. Sirve para validar flujos e interfaz antes de construir la versión con backend y base de datos real.

---

## 1. Contexto

El centro tiene dos grupos de personas que **no interactúan físicamente entre sí**:

1. Numerarios directores, numerarios residentes, un sacerdote y residentes — viven y conviven en la misma parte de la casa.
2. Administración — vive y trabaja en otra parte de la casa, encargada de cocinar, lavar, limpiar y mantener la casa. No ve ni oye a los demás miembros.

El sistema web es el **único medio de comunicación y coordinación** entre ambos grupos.

## 2. Roles del sistema

Existen 5 tipos de personas en el centro, pero solo **3 roles** dentro del sistema:

| Rol | Quiénes lo usan |
|---|---|
| **Director** | Numerarios directores |
| **Residente** | Numerarios residentes, el sacerdote, y residentes |
| **Administración** | Personal de administración |

El primer usuario creado es el **administrador inicial**, con permisos para crear y administrar las demás cuentas. En el prototipo, esta gestión de usuarios vive dentro de **Configuraciones**, disponible solo para el rol Director.

## 3. Login y cuentas

- Pantalla de login con correo y contraseña.
- El Director puede crear cuentas nuevas, asignarles nombre, siglas, correo, contraseña y rol (Director / Residente / Administración), y cambiar el rol de cuentas existentes.
- Ningún usuario puede cambiar su propio rol (medida de seguridad).
- El prototipo incluye cuentas de ejemplo listas para probar cada rol desde la pantalla de login.

## 4. Estructura general

Cuatro secciones principales, visibles según el rol:

- **Comidas**
- **Mensajes**
- **Calendario**
- **Configuraciones**

---

## 5. Sección: Comidas

Tiene dos apartados: **Plan semanal** y **Semana**. La comida en sí (el menú) **no se gestiona dentro del sistema** — eso lo decide Administración fuera de la aplicación. El sistema solo registra la **situación de cada persona frente a cada comida**, usando siempre las mismas seis opciones:

| Opción | Nota adicional |
|---|---|
| Sí comer | — |
| No comer | — |
| Comer temprano | Sí — hora a la que comerá |
| Comer tarde | Sí — hora a la que comerá |
| En bolsa | — |
| Enfermo | Sí — qué puede comer |

### 5.1. Plan semanal

- Es el **patrón habitual** de cada Director o Residente: para cada día de la semana y cada tiempo de comida (Desayuno, Almuerzo, Cena), la persona indica cuál de las seis opciones aplica normalmente.
- Cada persona edita **su propio** plan semanal; no es un menú compartido ni lo define el Director para todos.
- Administración solo puede **consultar** (no editar) el patrón habitual de cada persona, en una tabla comparativa.
- Este patrón sirve como referencia general; la confirmación real ocurre en el apartado Semana.

### 5.2. Semana

- Muestra los 7 días de la semana en curso con su fecha.
- Cada Director/Residente confirma o cambia su situación **para esa semana puntual**, usando las mismas seis opciones (con nota cuando corresponde a comer temprano, tarde o estar enfermo).
- Solo se puede modificar la selección de la **semana en curso** — no semanas pasadas ni futuras.
- Existe una **hora límite diaria** configurable por el Director (en Configuraciones): una vez superada esa hora, la selección de ese día queda bloqueada automáticamente.
- Administración visualiza, para todas las personas, la selección real de la semana en curso (quién come, no come, come temprano/tarde, está en bolsa o enfermo, con sus notas). Es una vista de solo lectura: Administración usa esta información para organizar la comida, pero no puede modificarla.
- Si una persona cambia su selección solo para una semana puntual (sin tocar su patrón habitual), ese cambio se refleja únicamente en la vista de Administración de esa semana — no afecta el Plan semanal ni otras semanas.

---

## 6. Sección: Mensajes

Funciona como un feed estilo Twitter/X o comentarios de YouTube:

- Cualquier persona con cuenta puede publicar un mensaje.
- Cada mensaje admite: reacción de pulgar arriba, respuesta (comentario) y eliminación.
- Las respuestas a un mensaje se agrupan visualmente como un **hilo** bajo la publicación original.
- **Permisos de eliminación:**
  - Cualquier usuario puede eliminar sus propios mensajes o respuestas.
  - Solo el rol **Director** puede eliminar mensajes o respuestas de **cualquier** usuario (moderación).
  - Residente y Administración no pueden borrar contenido ajeno.
- Administración tiene las mismas funciones que Residente en esta sección (publicar, reaccionar, responder, eliminar lo propio), pero sin el permiso especial de moderación del Director.

---

## 7. Sección: Calendario

- Interfaz simple, similar a Google Calendar: vista mensual, crear eventos, consultar eventos existentes.
- Director y Residente pueden crear y ver eventos.
- Administración **solo puede visualizar** los eventos: no puede crear ni agregar eventos (vista de solo lectura).

---

## 8. Sección: Configuraciones

Opciones disponibles, sin agregar nada fuera de lo solicitado:

- Editar nombre
- Editar siglas
- Editar correo
- Editar contraseña
- Editar rol *(bloqueado para la propia cuenta; el Director puede cambiar el rol de otras cuentas)*

**Adicional solo para Director:**
- Definir la **hora límite** diaria para modificar selecciones de comida.
- **Gestión de usuarios:** crear cuentas nuevas, asignar/cambiar rol de otras cuentas, eliminar cuentas.

---

## 9. Matriz de permisos por rol

| Función | Director | Residente | Administración |
|---|---|---|---|
| Ver/editar su propio Plan semanal | ✅ | ✅ | — (no aplica) |
| Ver Plan semanal de todos (solo lectura) | ❌ | ❌ | ✅ |
| Confirmar su selección en Semana (semana en curso) | ✅ | ✅ | — (no aplica) |
| Ver selección de Semana de todos | ❌ | ❌ | ✅ (solo lectura) |
| Definir hora límite de comidas | ✅ | ❌ | ❌ |
| Publicar / reaccionar / responder mensajes | ✅ | ✅ | ✅ |
| Eliminar mensajes propios | ✅ | ✅ | ✅ |
| Eliminar mensajes de cualquiera (moderación) | ✅ | ❌ | ❌ |
| Crear eventos de calendario | ✅ | ✅ | ❌ (solo lectura) |
| Ver calendario | ✅ | ✅ | ✅ |
| Editar su propio perfil | ✅ | ✅ | ✅ |
| Cambiar su propio rol | ❌ | ❌ | ❌ |
| Gestionar usuarios y roles de otros | ✅ | ❌ | ❌ |

---

## 10. Modelo de datos del prototipo

El prototipo guarda todo en `localStorage` bajo la clave `centro_app_state_v2`, con esta forma:

```js
{
  users: [
    { id, nombre, siglas, correo, password, role } // role: 'director' | 'residente' | 'administracion'
  ],
  currentUserId: string | null,

  // Patrón habitual por persona (Plan semanal). No incluye a Administración.
  weeklyPlan: {
    [userId]: {
      lun: { desayuno: statusId|null, almuerzo: statusId|null, cena: statusId|null },
      mar: { ... }, mie: { ... }, jue: { ... }, vie: { ... }, sab: { ... }, dom: { ... }
    }
  },

  // Selección real por semana concreta (apartado Semana).
  weeks: {
    [mondayISODate]: {
      [userId]: {
        [dayId]: { status: statusId|null, note: string }
      }
    }
  },

  messages: [
    {
      id, authorId, text, ts,
      likes: [userId, ...],
      replies: [ { id, authorId, text, ts } ]
    }
  ],

  events: [
    { id, title, date /* YYYY-MM-DD */, time, authorId }
  ],

  settings: { cutoffTime: 'HH:MM' } // hora límite diaria para editar Semana
}
```

`statusId` es uno de: `si`, `no`, `temprano`, `tarde`, `bolsa`, `enfermo`.

---

## 11. Estado del prototipo y próximos pasos

**Lo que ya existe (front-end, sin backend):**
- Login funcional contra usuarios en el estado local, con cuentas de ejemplo.
- Las 4 secciones completas, con vistas y permisos diferenciados por rol.
- Persistencia local vía `localStorage`, con manejo de error si el navegador la bloquea (por ejemplo al abrir el archivo como archivo local en vez de por `https`).
- Publicado como página web (artifact) para verlo y compartirlo desde cualquier dispositivo.

**Lo que falta para producción (fuera del alcance de este prototipo):**
- Backend real con base de datos (los datos hoy viven solo en el navegador de cada persona; no se sincronizan entre dispositivos ni usuarios).
- Autenticación segura (hoy las contraseñas se guardan en texto plano en el estado local, válido solo para demo).
- Notificaciones (por ejemplo, avisar cuando se acerca la hora límite de comidas, o cuando hay un mensaje nuevo).
- Validaciones de servidor para reforzar los permisos que hoy solo se aplican en el front-end.
- Posible registro de auditoría para la moderación de mensajes del Director.

---

## 12. Historial de decisiones tomadas durante el desarrollo

1. **Plan semanal reinterpretado:** en un principio se implementó como un menú de texto libre por día/comida. Se corrigió: Administración es quien decide la comida fuera del sistema, así que Plan semanal ahora usa las mismas seis opciones que Semana, como patrón personal de cada Director/Residente.
2. **Vista de Semana simplificada:** se quitó cualquier referencia al menú/comida en la vista de Semana de Director/Residente; solo se muestran las opciones de estado.
3. **Vista de Semana para Administración:** muestra únicamente la matriz de selección real de cada persona para la semana en curso (sin menú), reflejando cualquier cambio puntual de esa semana.
4. **Nombre del sistema:** se definió como "Centro El Molino" (título de inicio de sesión, pestaña del navegador y marca en la barra lateral).
5. **Tolerancia a almacenamiento bloqueado:** se agregó manejo de errores para que la aplicación no se rompa si el navegador bloquea `localStorage` (por ejemplo al abrir el `.html` como archivo local en un teléfono); en ese caso se avisa que los cambios no se guardarán en esa sesión.

---

*Documento generado a partir de la especificación original del sistema y de las decisiones tomadas durante las sesiones de trabajo con Claude.*
