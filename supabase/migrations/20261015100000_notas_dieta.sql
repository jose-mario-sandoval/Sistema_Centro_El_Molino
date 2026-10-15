-- Notas generales persistentes, independientes del estado o del cierre de cualquier comida.
create table public.notas_dieta (
  usuario_id uuid primary key references public.perfiles(id) on delete cascade,
  nota text not null check (nota = btrim(nota) and char_length(nota) between 1 and 1000)
);

comment on table public.notas_dieta is
  'Indicaciones generales opcionales de dieta. Las consultan su persona, el Director y Administración; solo su persona y el Director las gestionan.';

alter table public.notas_dieta enable row level security;
revoke all on table public.notas_dieta from anon;
grant select, insert, update, delete on table public.notas_dieta to authenticated;
grant all on table public.notas_dieta to service_role;

create policy "notas_dieta: lectura propia, del Director o de Administración"
  on public.notas_dieta for select to authenticated
  using (
    (select public.mi_rol()) = 'director'
    or (usuario_id = (select auth.uid()) and (select public.mi_rol()) = 'residente')
    or ((select public.mi_rol()) = 'administracion' and exists (
      select 1 from public.perfiles p
       where p.id = notas_dieta.usuario_id and p.activo
         and p.rol in ('director', 'residente') and not p.fuera_de_conteos
    ))
  );

create policy "notas_dieta: su persona o el Director crean"
  on public.notas_dieta for insert to authenticated
  with check (public.puedo_gestionar_comidas_de(usuario_id));
create policy "notas_dieta: su persona o el Director editan"
  on public.notas_dieta for update to authenticated
  using (public.puedo_gestionar_comidas_de(usuario_id))
  with check (public.puedo_gestionar_comidas_de(usuario_id));
create policy "notas_dieta: su persona o el Director eliminan"
  on public.notas_dieta for delete to authenticated
  using (public.puedo_gestionar_comidas_de(usuario_id));

-- Invoker: mismo permiso en la RPC y en las políticas de tabla. Vacío elimina de forma idempotente.
create function public.guardar_nota_dieta_de(p_usuario uuid, p_nota text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_nota text := nullif(btrim(p_nota), '');
begin
  if not public.puedo_gestionar_comidas_de(p_usuario) then
    raise exception 'No tiene permiso para gestionar esta nota de dieta' using errcode = '42501';
  end if;
  if char_length(v_nota) > 1000 then
    raise exception 'La nota de dieta puede tener hasta 1000 caracteres' using errcode = '23514';
  end if;
  if v_nota is null then
    delete from public.notas_dieta where usuario_id = p_usuario;
  else
    insert into public.notas_dieta(usuario_id, nota) values (p_usuario, v_nota)
    on conflict (usuario_id) do update set nota = excluded.nota;
  end if;
end;
$$;
revoke execute on function public.guardar_nota_dieta_de(uuid, text) from public, anon;
grant execute on function public.guardar_nota_dieta_de(uuid, text) to authenticated;
