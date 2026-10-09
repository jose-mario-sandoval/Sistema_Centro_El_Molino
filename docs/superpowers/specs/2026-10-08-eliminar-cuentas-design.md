# Eliminar cuentas definitivamente — diseño

Pedido del usuario (2026-10-08): que el Director pueda eliminar del sistema a un usuario, no solo
desactivarlo.

Hallazgo que definió el diseño: en la base, todo lo que apunta a `perfiles` se borraba en cascada,
**incluidos `eventos.creado_por`, `series_eventos.creado_por` y `enlaces_confirmacion.creado_por`**.
Eliminar la cuenta de un Director se habría llevado los eventos de la casa que esa persona cargó
(comprobado en el banco SQL: quedaban 0 eventos, 0 series, 0 enlaces).

## Decisiones tomadas con el usuario

1. **Sus mensajes se borran**, con las respuestas que otras personas escribieron dentro de sus
   publicaciones (se van con la publicación). El diálogo dice cuántos antes de confirmar.
2. **Solo se eliminan cuentas desactivadas.** Son dos pasos a propósito: primero "Desactivar", y
   recién en una fila desactivada aparece "Eliminar". Nadie borra por error una cuenta en uso.

## Reglas

1. **Qué se va** (cascada desde `auth.users` → `perfiles`): comidas (`plan_semanal`,
   `selecciones_comida`), `ausencias`, `mensajes` y lo que cuelga de ellos (respuestas, reacciones),
   suscripciones a avisos y su parte del registro de moderación. Las semanas pasadas dejan de
   contarla.
2. **Qué se conserva** (es de la casa): los eventos, las series y los enlaces de cena extra que
   cargó, con sus confirmaciones. `creado_por` pasa a `on delete set null` en las tres tablas. El
   trigger `eventos_antes_de_guardar` deja **vaciar** `creado_por` (el `set null` es un UPDATE y pasa
   por él), nunca cambiarlo por otro; `authenticated` no tiene permiso de UPDATE sobre esa columna.
   Los extras manuales y las marcas "lo cambió el Director" ya eran `set null`.
3. **Quién y a quién:** solo el Director (`perfilParaAccion('director')`), nunca a sí mismo, y solo
   una cuenta con `activo = false`. Como quien elimina es un Director activo, siempre queda uno.
4. **`resumen_para_eliminar_cuenta(p_usuario)`** (`security definer`, solo `service_role`): devuelve
   `activo`, `mensajes`, `respuestas_de_otros` y `eventos`. Sirve para dos cosas:
   - el diálogo muestra los números antes de confirmar;
   - es el seguro del despliegue: `eliminarCuenta` la llama **siempre** antes de borrar. Llega con la
     misma migración que conserva los eventos, así que si la migración no está aplicada la función no
     existe, la acción falla y no se borra nada.
5. **El borrado** es `auth.admin.deleteUser(id)` (API de administración), después de las guardas. No
   escribe en el registro de moderación (el trigger ignora los borrados sin sesión).

## Pantallas

- **Gestión de usuarios:** una fila desactivada suma el botón "Eliminar" (peligro) junto a
  "Reactivar". Las activas no lo tienen.
- **Diálogo "Eliminar cuenta":** nombre y usuario; mientras lee el resumen no ofrece eliminar y el
  foco está en "Cancelar". Después dice qué se borra, con números (`textoLoQueSeBorra`), qué se
  conserva (`textoLoQueSeConserva`) y "No se puede deshacer. Si solo querés que no entre, dejala
  desactivada." Confirmar: "Eliminar definitivamente".
- El diálogo de desactivar avisa que, una vez desactivada, la cuenta se puede eliminar.

## Orden de entrega

Migración `20261008100000_eliminar_cuentas.sql`: **antes de mergear**. Con el código viejo no cambia
nada visible (nadie borra cuentas). Si se mergeara sin ella, "Eliminar" fallaría con un mensaje y no
borraría nada (regla 4).

## Pruebas

- **Banco SQL local:** con y sin la migración, una cuenta con eventos, serie, enlace con
  confirmación, plan, selección, ausencia, publicación con respuesta ajena y respuesta en publicación
  ajena. Sin la migración se pierden los eventos; con ella quedan sin autor y se siguen editando.
- **Unitarias:** los textos del diálogo; las acciones (solo Director, no a sí mismo, solo
  desactivadas, cuenta inexistente, función ausente, fallo de Auth).
- **Integración (CI):** lo mismo que el banco, contra la base y el Auth reales.
- **E2E:** el Director desactiva, cancela, elimina; la fila desaparece y ese usuario ya no entra.

## Para quien agregue tablas

Una tabla nueva con una clave a `perfiles` tiene que decidir a propósito: ¿es de la persona
(`on delete cascade`) o de la casa (`on delete set null`)?
