-- Las reacciones también pertenecen a respuestas. La PK (mensaje_id, usuario_id) mantiene
-- una por persona y la FK conserva la limpieza en cascada al eliminar el mensaje o el hilo.
drop trigger reacciones_solo_publicaciones on public.reacciones;
drop function public.validar_reaccion_publicacion();

-- Se consulta sin RLS dentro de la función para evitar la recursión de mensajes -> padre -> mensajes.
-- Solo devuelve un permiso calculado para la sesión actual; nunca texto, identidades ni estado ajeno.
-- En hilos privados, quien escribió la publicación puede leer las respuestas aprobadas de otros.
create function public.puedo_leer_mensaje(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.soy_activo()) and exists (
    select 1
    from public.mensajes m
    left join public.mensajes padre on padre.id = m.padre_id
    where m.id = p_id
      and (m.estado = 'aprobado' or m.autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
      and (
        m.padre_id is null
        or (
          padre.id is not null and padre.padre_id is null
          and (padre.estado = 'aprobado' or padre.autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
        )
      )
      and (
        not coalesce(padre.solo_director, m.solo_director)
        or coalesce(padre.autor_id, m.autor_id) = (select auth.uid())
        or (select public.mi_rol()) in ('director', 'administracion')
      )
  );
$$;

revoke all on function public.puedo_leer_mensaje(uuid) from public, anon;
grant execute on function public.puedo_leer_mensaje(uuid) to authenticated, service_role;

drop policy "mensajes: lectura según estado y visibilidad" on public.mensajes;
create policy "mensajes: lectura según estado y visibilidad"
  on public.mensajes for select to authenticated
  using (
    (select public.soy_activo())
    and (estado = 'aprobado' or autor_id = (select auth.uid()) or (select public.mi_rol()) = 'director')
    and (
      (padre_id is not null and public.puedo_leer_mensaje(padre_id))
      or (
        padre_id is null
        and (not solo_director or autor_id = (select auth.uid()) or (select public.mi_rol()) in ('director', 'administracion'))
      )
    )
  );

-- La FK comprueba que el padre exista y validar_padre_mensaje mantiene un solo nivel.
-- Conocer el UUID de un hilo privado o pendiente ajeno no habilita responder en él.
drop policy "mensajes: publicar como uno mismo" on public.mensajes;
create policy "mensajes: publicar como uno mismo"
  on public.mensajes for insert to authenticated
  with check (
    (select public.soy_activo()) and autor_id = (select auth.uid())
    and (padre_id is null or public.puedo_leer_mensaje(padre_id))
  );

drop policy "reacciones: lectura según visibilidad del mensaje" on public.reacciones;
create policy "reacciones: lectura según visibilidad del mensaje"
  on public.reacciones for select to authenticated
  using (public.puedo_leer_mensaje(mensaje_id));

-- La política anterior solo comprobaba la identidad de quien reacciona: permitía reaccionar
-- a una publicación oculta adivinando su UUID. Ahora inserción y borrado exigen poder leer el hilo.
drop policy "reacciones: reaccionar como uno mismo" on public.reacciones;
create policy "reacciones: reaccionar como uno mismo"
  on public.reacciones for insert to authenticated
  with check (usuario_id = (select auth.uid()) and public.puedo_leer_mensaje(mensaje_id));

drop policy "reacciones: quitar la propia" on public.reacciones;
create policy "reacciones: quitar la propia"
  on public.reacciones for delete to authenticated
  using (usuario_id = (select auth.uid()) and public.puedo_leer_mensaje(mensaje_id));
