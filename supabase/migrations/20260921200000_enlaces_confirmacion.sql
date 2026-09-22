-- =========================================================
-- Enlace público de confirmación de cena extra.
--
-- Primera escritura de la app sin sesión: el Director genera, desde un
-- evento, un enlace con vencimiento para que gente externa confirme cuántas
-- cenas/comidas extra necesita. El token es el único control de acceso —
-- anon no tiene ningún privilegio sobre estas tablas, solo puede llamar dos
-- funciones security definer.
-- =========================================================

create table public.enlaces_confirmacion (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos (id) on delete cascade,
  tiempo_comida public.tiempo_comida not null,
  vence_en timestamptz not null,
  -- gen_random_uuid() (sin extensión: ya lo usa toda la base) da 122 bits de aleatoriedad, de sobra
  -- para un token no adivinable. gen_random_bytes() daría lo mismo pero exige la extensión pgcrypto,
  -- que este repo nunca habilita (solo pg_cron y pg_net están creadas — ver otras migraciones).
  token text not null unique default gen_random_uuid()::text,
  creado_por uuid not null references public.perfiles (id) on delete cascade,
  creado_en timestamptz not null default now()
);

comment on table public.enlaces_confirmacion is
  'Enlace público (sin sesión) para confirmar comidas extra de un evento. El token es el único control de acceso.';

create index enlaces_confirmacion_evento_idx on public.enlaces_confirmacion (evento_id);

create table public.confirmaciones_extra (
  id uuid primary key default gen_random_uuid(),
  enlace_id uuid not null references public.enlaces_confirmacion (id) on delete cascade,
  nombre text not null check (nombre = btrim(nombre) and length(nombre) between 1 and 120),
  cantidad_personas smallint not null check (cantidad_personas between 1 and 10),
  creado_en timestamptz not null default now()
);

create index confirmaciones_extra_enlace_idx on public.confirmaciones_extra (enlace_id);

-- ---------- RLS: el Director ve y crea; nadie más lee ni escribe directo ----------
alter table public.enlaces_confirmacion enable row level security;
alter table public.confirmaciones_extra enable row level security;

revoke all on table public.enlaces_confirmacion from anon;
revoke all on table public.confirmaciones_extra from anon;
grant select, insert on table public.enlaces_confirmacion to authenticated;
grant select on table public.confirmaciones_extra to authenticated;
grant select, insert, update, delete on table public.enlaces_confirmacion to service_role;
grant select, insert, update, delete on table public.confirmaciones_extra to service_role;
-- Adelantar vence_en es la única forma de revocar antes de tiempo (spec §3, regla 6).
revoke update on table public.enlaces_confirmacion from authenticated;
grant update (vence_en) on table public.enlaces_confirmacion to authenticated;

create policy "enlaces_confirmacion: el Director los lee"
  on public.enlaces_confirmacion for select
  to authenticated
  using ((select public.mi_rol()) = 'director');

create policy "enlaces_confirmacion: el Director crea"
  on public.enlaces_confirmacion for insert
  to authenticated
  with check (
    (select public.mi_rol()) = 'director'
    and creado_por = (select auth.uid())
    and vence_en > (select now())
  );

create policy "enlaces_confirmacion: el Director adelanta el vencimiento"
  on public.enlaces_confirmacion for update
  to authenticated
  using ((select public.mi_rol()) = 'director')
  with check ((select public.mi_rol()) = 'director');

create policy "confirmaciones_extra: el Director las lee"
  on public.confirmaciones_extra for select
  to authenticated
  using ((select public.mi_rol()) = 'director');
-- Sin política de INSERT para nadie autenticado ni anónimo: solo entra por confirmar_cena_extra().

-- ---------- Acceso público: dos funciones, nada más ----------
create function public.info_enlace_confirmacion(p_token text)
returns table (
  evento_titulo text,
  fecha date,
  hora time,
  tiempo_comida public.tiempo_comida,
  vigente boolean,
  vence_en timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.titulo, e.fecha, e.hora, l.tiempo_comida, (now() < l.vence_en), l.vence_en
  from public.enlaces_confirmacion l
  join public.eventos e on e.id = l.evento_id
  where l.token = p_token
$$;

create function public.confirmar_cena_extra(p_token text, p_nombre text, p_cantidad smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enlace_id uuid;
  v_vence_en timestamptz;
begin
  select id, vence_en into v_enlace_id, v_vence_en
  from public.enlaces_confirmacion
  where token = p_token;

  if v_enlace_id is null then
    raise exception 'Este enlace no es válido.' using errcode = 'MOL05';
  end if;

  if now() >= v_vence_en then
    raise exception 'Este enlace ya venció.' using errcode = 'MOL05';
  end if;

  insert into public.confirmaciones_extra (enlace_id, nombre, cantidad_personas)
  values (v_enlace_id, p_nombre, p_cantidad);
end;
$$;

revoke execute on function public.info_enlace_confirmacion(text) from public;
revoke execute on function public.confirmar_cena_extra(text, text, smallint) from public;
grant execute on function public.info_enlace_confirmacion(text) to anon, authenticated, service_role;
grant execute on function public.confirmar_cena_extra(text, text, smallint) to anon, authenticated, service_role;
