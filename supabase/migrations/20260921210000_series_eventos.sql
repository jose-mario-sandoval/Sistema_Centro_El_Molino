-- =========================================================
-- Recurrencia de eventos. Cada ocurrencia es una fila normal de `eventos`
-- (con `serie_id`): editar o cancelar una fecha puntual usa el UPDATE/DELETE
-- que ya existe, sin tocarlo. `series_eventos` solo guarda el patrón para
-- poder generar las filas al crear la serie; no se edita ni se borra nunca
-- (para cambiar el patrón: cancelar hacia adelante y crear una serie nueva).
-- =========================================================

create type public.patron_recurrencia as enum ('semanal', 'mensual_dia_fijo', 'mensual_dia_semana');

create table public.series_eventos (
  id uuid primary key default gen_random_uuid(),
  patron public.patron_recurrencia not null,
  dia_semana smallint check (dia_semana between 1 and 7),
  ordinal_semana smallint check (ordinal_semana in (1, 2, 3, 4, -1)),
  dia_mes smallint check (dia_mes between 1 and 31),
  fecha_inicio date not null,
  fecha_fin date not null,
  hora time,
  titulo text not null check (titulo = btrim(titulo) and length(titulo) between 1 and 120),
  tipo public.tipo_evento not null default 'otro',
  requiere_cocina public.requerimiento_cocina[] not null default '{}',
  requiere_otro_texto text,
  creado_por uuid not null references public.perfiles (id) on delete cascade,
  creado_en timestamptz not null default now(),
  constraint series_eventos_rango_valido check (fecha_fin >= fecha_inicio and (fecha_fin - fecha_inicio) <= 730),
  constraint series_eventos_campos_de_patron check (
    (patron = 'semanal' and dia_semana is not null and ordinal_semana is null and dia_mes is null)
    or (patron = 'mensual_dia_fijo' and dia_mes is not null and dia_semana is null and ordinal_semana is null)
    or (patron = 'mensual_dia_semana' and dia_semana is not null and ordinal_semana is not null and dia_mes is null)
  ),
  constraint series_eventos_requiere_cocina_valido check (public.requiere_cocina_valido(requiere_cocina)),
  constraint series_eventos_requiere_otro_texto_valido check (
    requiere_otro_texto is null or (requiere_otro_texto = btrim(requiere_otro_texto) and length(requiere_otro_texto) between 1 and 200)
  )
);

comment on table public.series_eventos is
  'Solo el patrón de una serie ya creada (para mostrar "parte de una serie" y poder cancelarla hacia adelante). Sin UPDATE ni DELETE: para cambiar el patrón se cancela y se crea una serie nueva.';

alter table public.series_eventos enable row level security;
revoke all on table public.series_eventos from anon;
grant select, insert on table public.series_eventos to authenticated;
grant select, insert, update, delete on table public.series_eventos to service_role;

create policy "series_eventos: el Director lee"
  on public.series_eventos for select
  to authenticated
  using ((select public.mi_rol()) = 'director');

create policy "series_eventos: el Director crea"
  on public.series_eventos for insert
  to authenticated
  with check ((select public.mi_rol()) = 'director' and creado_por = (select auth.uid()));

-- ---------- Cada ocurrencia es una fila de eventos ----------
alter table public.eventos add column serie_id uuid references public.series_eventos (id);
create index eventos_serie_idx on public.eventos (serie_id) where serie_id is not null;
comment on column public.eventos.serie_id is
  'De qué serie es esta ocurrencia, si es que viene de una. Editar/borrar esta fila no toca las demás.';

-- ---------- Crear la serie completa: atómico (la serie + todas sus filas, o ninguna) ----------
-- Sin security definer: corre como quien llama, así RLS de series_eventos y eventos se aplica normal
-- (Director, creado_por = auth.uid()) en cada INSERT que hace, fila por fila.
create function public.crear_serie_eventos(
  p_patron public.patron_recurrencia,
  p_dia_semana smallint,
  p_ordinal_semana smallint,
  p_dia_mes smallint,
  p_fecha_inicio date,
  p_fecha_fin date,
  p_hora time,
  p_titulo text,
  p_tipo public.tipo_evento,
  p_requiere_cocina public.requerimiento_cocina[],
  p_requiere_otro_texto text,
  p_fechas date[]
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_serie_id uuid;
begin
  if coalesce(array_length(p_fechas, 1), 0) = 0 then
    raise exception 'Ese patrón no genera ninguna fecha en el rango elegido.';
  end if;
  if exists (select 1 from unnest(p_fechas) as f where f < p_fecha_inicio or f > p_fecha_fin) then
    raise exception 'Alguna fecha generada cae fuera del rango de la serie.';
  end if;

  insert into public.series_eventos (
    patron, dia_semana, ordinal_semana, dia_mes, fecha_inicio, fecha_fin, hora, titulo, tipo,
    requiere_cocina, requiere_otro_texto, creado_por
  ) values (
    p_patron, p_dia_semana, p_ordinal_semana, p_dia_mes, p_fecha_inicio, p_fecha_fin, p_hora, p_titulo, p_tipo,
    p_requiere_cocina, p_requiere_otro_texto, auth.uid()
  )
  returning id into v_serie_id;

  insert into public.eventos (titulo, fecha, hora, tipo, requiere_cocina, requiere_otro_texto, serie_id, creado_por)
  select p_titulo, fecha, p_hora, p_tipo, p_requiere_cocina, p_requiere_otro_texto, v_serie_id, auth.uid()
  from unnest(p_fechas) as fecha;

  return v_serie_id;
end;
$$;

grant execute on function public.crear_serie_eventos(
  public.patron_recurrencia, smallint, smallint, smallint, date, date, time, text, public.tipo_evento,
  public.requerimiento_cocina[], text, date[]
) to authenticated;
