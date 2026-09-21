# Ausencias: diseño

Cada Director o Residente puede marcar los días que no estará en la casa. Sus comidas de esos días
quedan canceladas solas. Este documento fija las reglas y explica las decisiones que no son obvias,
sobre todo el congelado de comidas, que es donde es fácil romper algo sin darse cuenta.

Código: `supabase/migrations/20260921180000_ausencias_origen.sql` y `20260921180100_ausencias.sql`,
`lib/ausencias/`, `lib/comidas/{reglas,vista,consultas}.ts`, `app/(app)/calendario/`.

## Reglas acordadas

1. **Rango de días.** Una ausencia es un rango (`desde`–`hasta`, ambos incluidos); un solo día es
   `desde = hasta`. Dura como mucho 365 días. No se puede registrar una ausencia que ya pasó por completo.
2. **Valor efectivo de una comida:**
   `selección de la persona → ausencia → plan → "Sin definir"`.
   Ausencia = «No comer», con origen `ausencia`. La ausencia y el plan solo cuentan mientras la
   comida no cerró; al cerrar se congelan en una selección.
3. **Reactivar una comida puntual.** La selección de la persona gana sobre la ausencia. Elegir «No
   comer» estando ausente **no** es una excepción (es la referencia); elegir cualquier otra cosa sí.
4. **Volver a la referencia.** «Volver a mi ausencia» (o «Volver a mi plan» si no está ausente) borra la
   excepción y deja rigiendo la referencia del día.
5. **Al quitar la ausencia** vuelve a regir el plan semanal.
6. **Lo que ya cerró no se toca.** La cocina ya contó con esas comidas.
7. **Privacidad.** Las ausencias son de su dueña: nadie más las lee, ni siquiera Administración.
   La cocina ve el efecto («No comer»), nunca el motivo ni las fechas.
8. **Sin editar.** Para cambiar un rango se quita y se vuelve a marcar (no hay `UPDATE`).

## Dónde vive cada regla

| Regla | En SQL | En TypeScript |
|---|---|---|
| Valor efectivo | `cerrar_comidas_vencidas`, `guardar_seleccion`, `comidas_sin_definir` | `valorEfectivo` (`lib/comidas/reglas.ts`), `armarSemanaPersona`, `armarDiaAdministracion` |
| Referencia al guardar | `guardar_seleccion` | `valorTrasGuardar` |
| Quién ve qué | RLS de `ausencias`, `ausentes_en()` | `listarMisAusencias`, `obtenerDiaParaAdministracion` |

`valorEfectivo` (TS) y el SQL calculan lo mismo por dos caminos; si cambia uno, cambia el otro.

## El congelado: la parte delicada

Un job de `pg_cron` corre cada 5 minutos (`cerrar_comidas_vencidas`) y congela las comidas cuya hora
límite pasó: escribe el valor vigente en `selecciones_comida` y las marca en `comidas_cerradas`. Ahí
empieza la garantía de que **después del cierre nada cambia**.

Con ausencias hay una ventana peligrosa: **entre que pasa la hora límite y el job congela (hasta 5
minutos)** la comida ya venció pero sigue calculándose «en vivo». Si en ese intervalo alguien agrega
o quita una ausencia, el valor cambiaría *después* del cierre y la cocina ya había contado con el
anterior.

**Solución:** un trigger `BEFORE INSERT OR DELETE` sobre `ausencias` llama a
`congelar_comidas_de(usuario, desde, hasta)`, que **antes** de la modificación congela las comidas ya
vencidas del rango con el valor que tenían en ese momento:

- al **agregar** una ausencia, se congelan con lo que valían antes (el plan);
- al **quitar** una ausencia, se congelan como «No comer» por la ausencia.

Detalles que importan:

- Solo congela lo **vencido** (hora límite pasada), no lo «no editable». Una comida de dentro de tres
  semanas no es editable todavía pero tampoco venció: congelarla sería un error.
- Solo mira de `hoy - 7` a `hoy + 1`: fuera de ahí todo ya está congelado o no puede haber vencido.
- Es `security definer`: escribe como el dueño, no como `authenticated`. Como `authenticated`, el
  trigger `selecciones_comida_forzar_origen` reescribiría el origen a `persona`.
- Ignora cuentas inactivas o sin comidas, y el borrado en cascada de una cuenta (el perfil ya no
  existe y insertar violaría la clave foránea).
- `on conflict do nothing`: nunca pisa una comida ya congelada ni una elección de la persona.

El job (`cerrar_comidas_vencidas`) y el trigger llegan al mismo resultado, así que da igual cuál corra
primero. Los tests de integración lo verifican con cualquiera de los dos órdenes.

## Origen `ausencia`

`origen_seleccion` ganó el valor `ausencia` para que la comida congelada de alguien ausente se pueda
distinguir de «según tu plan». Va en su **propia migración**: un valor nuevo de un enum no se puede
usar en la misma transacción que lo agrega, y la migración siguiente sí lo usa.

Un límite conocido: `selecciones_comida` sigue siendo legible por Administración (necesita las
selecciones para la hoja de la cocina), así que quien consulte la API a mano vería `origen =
'ausencia'`, es decir, que ese «No comer» fue por una ausencia. No revela el motivo ni las fechas.

## Administración

No lee la tabla `ausencias`. Para armar la hoja de un día llama a `ausentes_en(fecha)`, que solo
devuelve *quiénes* están ausentes ese día (los ids, sin repetir aunque los rangos se solapen), y solo
responde al rol Administración. Con eso calcula «No comer» igual que para cualquier otra persona.

## Orden de las migraciones

Las migraciones se aplican solas a producción al hacer merge a `master`, y `supabase db push` rechaza
una migración anterior a la última aplicada. Por eso los PR que agregan migraciones se mergean **en el
orden de su fecha**.

## Cómo se verificó

Además de los tests del repo (unitarios, de integración y E2E), el SQL se probó contra un PostgreSQL
real con las migraciones aplicadas de verdad: acceso por rol, la referencia de `guardar_seleccion`, el
congelado del job con ausentes, la ventana entre el cierre y el job (agregar y quitar), el borrado en
cascada de una cuenta, y los recordatorios.
