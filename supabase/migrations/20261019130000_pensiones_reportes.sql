-- Reportes privados. Storage sólo es accesible por el servidor, después de comprobar la sesión.
-- 3 MiB permite enviar FormData por Vercel sin superar su límite de cuerpo de función.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pensiones-reportes', 'pensiones-reportes', false, 3145728, array['application/pdf']);

create policy "reportes pensiones: archivos solo por servidor"
on storage.objects as restrictive for all to anon, authenticated
using (bucket_id <> 'pensiones-reportes') with check (bucket_id <> 'pensiones-reportes');

create table public.pensiones_reportes (
  id uuid primary key,
  categoria text not null check (categoria in ('finanzas', 'otras_utilidades')),
  nombre text not null check (char_length(nombre) between 1 and 180),
  ruta text not null unique,
  tamano integer not null check (tamano between 1 and 3145728),
  cargado_en timestamptz not null default clock_timestamp(),
  cargado_por uuid references public.perfiles(id) on delete set null
);
create index pensiones_reportes_orden on public.pensiones_reportes (categoria, cargado_en desc, id desc);
alter table public.pensiones_reportes enable row level security;
revoke all on public.pensiones_reportes from anon, authenticated;
grant select on public.pensiones_reportes to authenticated;
create policy "reportes pensiones: lectura autorizada" on public.pensiones_reportes for select to authenticated
using ((select public.mi_rol()) in ('director', 'administradora'));

-- Una reserva durable se guarda ANTES de subir bytes. Un corte de la función nunca pierde la ruta.
create table public.pensiones_reportes_reservas (
  id uuid primary key default gen_random_uuid(),
  categoria text not null check (categoria in ('finanzas', 'otras_utilidades')),
  nombre text not null check (char_length(nombre) between 1 and 180),
  ruta text not null unique,
  tamano integer not null check (tamano between 1 and 3145728),
  usuario_id uuid not null,
  creado_en timestamptz not null default clock_timestamp()
);
create table public.pensiones_reportes_limpieza (
  ruta text primary key,
  creado_en timestamptz not null default clock_timestamp()
);
alter table public.pensiones_reportes_reservas enable row level security;
alter table public.pensiones_reportes_limpieza enable row level security;
revoke all on public.pensiones_reportes_reservas, public.pensiones_reportes_limpieza from anon, authenticated;
grant all on public.pensiones_reportes, public.pensiones_reportes_reservas, public.pensiones_reportes_limpieza to service_role;

create function public.reservar_reporte_pension(p_categoria text, p_nombre text, p_tamano integer)
returns table (id uuid, ruta text)
language plpgsql security definer set search_path = '' as $$
declare v_id uuid := gen_random_uuid(); v_ruta text;
begin
  if (select public.mi_rol()) is distinct from 'administradora'::public.rol then
    raise exception 'Sólo la Administradora puede subir reportes' using errcode = '42501';
  end if;
  v_ruta := p_categoria || '/' || v_id::text || '.pdf';
  insert into public.pensiones_reportes_reservas (id, categoria, nombre, ruta, tamano, usuario_id)
  values (v_id, p_categoria, p_nombre, v_ruta, p_tamano, auth.uid());
  return query select v_id, v_ruta;
end;
$$;

create function public.finalizar_reporte_pension(p_id uuid)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_reserva public.pensiones_reportes_reservas; v_antiguo record;
begin
  if (select public.mi_rol()) is distinct from 'administradora'::public.rol then
    raise exception 'Sólo la Administradora puede subir reportes' using errcode = '42501';
  end if;
  -- Idempotente ante una respuesta perdida después de confirmar la transacción.
  if exists (select 1 from public.pensiones_reportes r where r.id = p_id and r.cargado_por = auth.uid()) then
    return p_id;
  end if;
  select * into v_reserva from public.pensiones_reportes_reservas r
  where r.id = p_id and r.usuario_id = auth.uid() for update;
  if not found then raise exception 'La reserva de carga ya no está disponible' using errcode = 'P0001'; end if;
  if v_reserva.creado_en < clock_timestamp() - interval '1 hour' then
    raise exception 'La reserva de carga venció' using errcode = 'P0001';
  end if;
  -- Nunca se publican metadatos antes de que Storage haya confirmado el objeto.
  if not exists (select 1 from storage.objects o where o.bucket_id = 'pensiones-reportes' and o.name = v_reserva.ruta) then
    raise exception 'El archivo todavía no está almacenado' using errcode = 'P0001';
  end if;
  -- El candado de cada categoría serializa también las cargas de sesiones diferentes.
  perform pg_advisory_xact_lock(hashtextextended('pensiones-reportes:' || v_reserva.categoria, 0));
  insert into public.pensiones_reportes (id, categoria, nombre, ruta, tamano, cargado_por)
  values (v_reserva.id, v_reserva.categoria, v_reserva.nombre, v_reserva.ruta, v_reserva.tamano, v_reserva.usuario_id);
  delete from public.pensiones_reportes_reservas where id = p_id;
  for v_antiguo in
    select r.id, r.ruta from public.pensiones_reportes r where r.categoria = v_reserva.categoria
    order by r.cargado_en desc, r.id desc offset 12
  loop
    insert into public.pensiones_reportes_limpieza (ruta) values (v_antiguo.ruta) on conflict do nothing;
    delete from public.pensiones_reportes where id = v_antiguo.id;
  end loop;
  return p_id;
end;
$$;

create function public.abandonar_reporte_pension(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_ruta text;
begin
  if (select public.mi_rol()) is distinct from 'administradora'::public.rol then
    raise exception 'Sólo la Administradora puede cancelar una carga' using errcode = '42501';
  end if;
  -- La misma fila bloqueada por finalizar evita borrar un archivo si se perdió su respuesta.
  select r.ruta into v_ruta from public.pensiones_reportes_reservas r
  where r.id = p_id and r.usuario_id = auth.uid() for update;
  if found then
    insert into public.pensiones_reportes_limpieza (ruta) values (v_ruta) on conflict do nothing;
    delete from public.pensiones_reportes_reservas where id = p_id;
  end if;
end;
$$;

-- Sólo el trabajador del servidor puede pedir la cola. Reconcilia Storage para recoger incluso
-- una carga que terminó tarde, después de vencer/cancelarse la reserva y de una limpieza anterior.
create function public.preparar_limpieza_reportes_pension()
returns table (ruta text)
language plpgsql security definer set search_path = '' as $$
declare v_reserva record;
begin
  for v_reserva in select r.id, r.ruta from public.pensiones_reportes_reservas r
    where r.creado_en < clock_timestamp() - interval '1 hour' for update skip locked
  loop
    insert into public.pensiones_reportes_limpieza (ruta) values (v_reserva.ruta) on conflict do nothing;
    delete from public.pensiones_reportes_reservas where id = v_reserva.id;
  end loop;
  insert into public.pensiones_reportes_limpieza (ruta)
    select o.name from storage.objects o where o.bucket_id = 'pensiones-reportes'
    and not exists (select 1 from public.pensiones_reportes r where r.ruta = o.name)
    and not exists (select 1 from public.pensiones_reportes_reservas r where r.ruta = o.name)
    on conflict do nothing;
  return query select l.ruta from public.pensiones_reportes_limpieza l
    where not exists (select 1 from public.pensiones_reportes r where r.ruta = l.ruta)
    and not exists (select 1 from public.pensiones_reportes_reservas r where r.ruta = l.ruta)
    order by l.creado_en, l.ruta limit 100;
end;
$$;

revoke execute on function public.reservar_reporte_pension(text,text,integer), public.finalizar_reporte_pension(uuid),
  public.abandonar_reporte_pension(uuid), public.preparar_limpieza_reportes_pension() from public, anon, authenticated;
grant execute on function public.reservar_reporte_pension(text,text,integer), public.finalizar_reporte_pension(uuid),
  public.abandonar_reporte_pension(uuid) to authenticated;
grant execute on function public.preparar_limpieza_reportes_pension() to service_role;

create function public.llamar_limpieza_reportes_pension()
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secreto text;
begin
  select s.decrypted_secret into v_url from vault.decrypted_secrets s where s.name = 'url_app';
  select s.decrypted_secret into v_secreto from vault.decrypted_secrets s where s.name = 'cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secreto, '') = '' then return null; end if;
  return net.http_post(url := rtrim(v_url, '/') || '/api/cron/pensiones-reportes', body := '{}'::jsonb,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto, 'Content-Type', 'application/json'),
    timeout_milliseconds := 10000);
end;
$$;
revoke execute on function public.llamar_limpieza_reportes_pension() from public, anon, authenticated, service_role;
select cron.schedule('limpiar-reportes-pensiones', '*/10 * * * *', 'select public.llamar_limpieza_reportes_pension()');

comment on table public.pensiones_reportes is 'Máximo 12 PDF por categoría. Los retirados se borran de Storage por cola durable; sólo se descargan con sesión vigente en la app.';

alter publication supabase_realtime add table public.pensiones_reportes;
