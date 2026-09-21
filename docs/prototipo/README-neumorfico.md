# Prototipo neumórfico: guía de prueba con usuarios

`centro-el-molino-neumorfico.html` es un prototipo de un solo archivo, sin backend, para validar el
nuevo lenguaje visual **con residentes mayores reales** antes de tocar la app Next.js. El sistema de
diseño que implementa está en [`DESIGN.md`](../../DESIGN.md), en la raíz del repositorio.

No reemplaza al prototipo original (`centro-el-molino.html`): usa otra clave de almacenamiento y
pueden convivir.

---

## Cómo abrirlo

**En el teléfono, publicalo en una dirección `https`** (por ejemplo como página privada, o en
cualquier hosting estático). Abierto como archivo local, Safari en iPhone bloquea el almacenamiento y
el prototipo avisa *"Sin guardado"*: sigue funcionando, pero se olvida todo al recargar.

En la computadora basta con abrir el archivo en Chrome, Edge o Firefox.

| Cuenta | Correo | Rol |
|---|---|---|
| Carlos Bonilla | `director@molino.sv` | Director |
| Ramón Alvarado | `ramon@molino.sv` | Residente |
| P. José Meléndez | `jose@molino.sv` | Residente |
| Marta Hernández | `cocina@molino.sv` | Administración |

Contraseña de todas: **`molino`**. En el login también se puede tocar directamente una cuenta de
prueba.

**Entre una persona y la siguiente**, tocá **Restablecer datos de prueba** en el login (hay que
cerrar sesión primero). Vuelve a los datos iniciales **y** a la apariencia normal, porque el punto es
ver qué elige cada persona partiendo de lo mismo. En la computadora también sirve agregar `?reset` al
final de la dirección, pero eso solo restablece los datos, no la apariencia.

### Datos de ejemplo que conviene conocer

- **Ramón nunca definió la cena de miércoles y jueves.** Es a propósito: así se ve el estado
  *"Sin definir"* en su pantalla (*"¿Vas a cenar el miércoles?"*) y en la de Administración
  (*"Falta definir"*).
- Carlos tiene un cambio puntual (no almuerza el miércoles de esta semana): muestra la marca
  *"Cambiada"*.
- El P. José cena tarde por costumbre, a las 21:00 según su plan semanal. Este martes lo cambió a
  las 21:15: en la vista de la cocina se ven las dos horas, cada una en su día.

---

## La prueba

### A quién

**Dos o tres residentes mayores**, de los que menos usan el teléfono. No sirve probarlo con quien ya
se maneja bien: el rediseño existe para los otros.

Si se puede, **en su propio teléfono**, con su tamaño de letra de siempre.

### Reglas para quien conduce la prueba

1. **No expliques nada de la interfaz.** Ni qué es el relieve, ni dónde tocar. Si la persona
   pregunta, respondé *"¿Qué haría usted?"* y anotá la pregunta: esa pregunta es el hallazgo.
2. **No ayudes con el dedo.** Si después de un minuto largo no avanza, ahí sí se ayuda, y la tarea se
   cuenta como *no completada sola*.
3. **Pedile que piense en voz alta.** *"Cuénteme qué está mirando."*
4. Una tarea a la vez, en este orden.

### Las tres tareas

Iniciá sesión vos con la cuenta de **Ramón** y entregale el teléfono en la pantalla de Comidas.

**1. *"Avísele a la cocina que mañana no va a almorzar."***

Es la tarea que decide todo. Mide la acción más frecuente de la app.

> **Ojo con el día de la semana.** Si la prueba se hace un **domingo**, "mañana" cae en la semana
> siguiente, y la persona tiene que encontrar el botón *"Ver la semana que viene"*. Es un caso real
> (le pasa a todos cada domingo) y vale la pena observarlo, pero anotá qué día se hizo la prueba,
> porque cambia la dificultad.

**2. *"Normalmente, los martes usted cena temprano. Déjelo anotado para todas las semanas."***

Mide si se entiende la diferencia entre **Plan semanal** (lo de siempre) y **Semana** (lo de esta
semana). Es la distinción conceptual más difícil de la app.

**3. *"Ponga la letra más grande."***

Mide si **Aa** se reconoce como el control de tamaño de letra sin que nadie lo diga.

### Qué anotar

Una hoja por persona:

| | Tarea 1 | Tarea 2 | Tarea 3 |
|---|---|---|---|
| ¿La completó sola? (sí / con ayuda / no) | | | |
| Tiempo aproximado | | | |
| Toques equivocados (dónde) | | | |
| Qué preguntó, textual | | | |
| Dónde dudó más | | | |

Y al final:

- **Qué eligió en Aa** (tamaño, contraste, tema), y si cambió algo por iniciativa propia.
- ¿Tocó algo que **no** era un botón, creyendo que lo era? ¿O ignoró algo que sí lo era? Esa es la
  pregunta directa sobre si el relieve funciona como señal.
- Una frase suya sobre cómo le pareció, textual.

### Qué decide la prueba

- **Si la tarea 1 no sale sola, el rediseño no está listo**, por bonito que se vea. Es la razón de
  ser de la app.
- Si la tarea 2 falla pero la 1 sale, el problema es de concepto (plan vs. semana) y no de estética;
  se resuelve con textos y orden, no con más relieve.
- **La combinación de Aa que elija la mayoría es el candidato a valor por defecto** para producción.
  Si dos de tres suben la letra, la base de 18px todavía se queda corta.
- Si alguien pasa de largo un control elevado o toca una superficie plana creyendo que era un
  botón, anotá exactamente cuál: es evidencia directa sobre el relieve, que es la apuesta central.

---

## Qué verificar además, sin personas

Estas comprobaciones ya se corrieron durante el desarrollo; conviene repetirlas si se modifica el
prototipo.

| Qué | Cómo | Resultado al entregar |
|---|---|---|
| Contraste de la paleta | Script de ratios WCAG sobre los 4 modos y los 6 estados | 0 fallos |
| Relieve perceptible | ΔL\* de cada sombra respecto del fondo | Claro 15.9 / 4.9 · Oscuro 7.8 / 6.2 |
| Desbordes y objetivos táctiles | Recorrido automático de 3 roles × 5 pantallas × 3 tamaños × 2 contrastes a **320px** de ancho | 90 combinaciones: 0 desbordes, 0 controles bajo 56×56, 0 etiquetas partidas |
| Navegación | Los mismos recorridos, tocando la barra real | 15 de 15 |
| Foco | Abrir fila → elegir → Listo → cambiar de sección | El foco nunca se pierde |

**Una excepción conocida:** en teléfonos de 320px, la cuadrícula mensual del calendario deja días de
~36px de ancho. Siete columnas no caben a 56px. Por eso en el teléfono el calendario abre en **lista**
(que sí cumple) y la cuadrícula es opcional, detrás de *"Ver mes"*. Cumple igualmente WCAG 2.2 AA
(24px).

---

## Qué no es

- **No tiene backend.** Los datos viven en el navegador de quien lo abre; no se sincronizan entre
  teléfonos.
- **Las notificaciones no funcionan**: el botón existe para mostrar dónde van.
- **La gestión de cuentas es de solo lectura**: se muestra la lista, pero no se crean ni desactivan
  cuentas. No es lo que se está evaluando.
- **Las contraseñas están en texto plano** dentro del archivo. Es una demo; no uses contraseñas
  reales.
