-- =========================================================
-- "La casa" del Director (2/2): extras manuales.
--
-- El Director avisa a la cocina de comidas extra que no pasan por el enlace público (visitas,
-- huéspedes): día + comida + cantidad + una nota opcional para la cocina. Administración ve la
-- cifra (sumada a las confirmaciones del enlace) y la nota, nunca quién lo agregó. La nota es
-- texto libre que llega a Administración: el formulario advierte que no lleve nombres.
-- =========================================================

create table public.extras_manuales (
  id uuid primary key default gen_random_uuid(),
  fecha date not null check (fecha between '2000-01-01' and '2099-12-31'),
  tiempo_comida public.tiempo_comida not null,
  cantidad smallint not null check (cantidad between 1 and 50),
  -- Llega recortada (zod): la base rechaza espacios al inicio o al final y la nota vacía.
  nota text check (nota is null or (nota = btrim(nota) and length(nota) between 1 and 200)),
  -- set null, no cascade: borrar la cuenta de un Director no borra lo que la cocina ya preparó.
  creado_por uuid default auth.uid() references public.perfiles (id) on delete set null,
  creado_en timestamptz not null default now()
);

comment on table public.extras_manuales is
  'Comidas extra que agrega el Director a mano. Administración ve cantidad y nota (extras_de_la_semana, extras_manuales_de_la_semana), nunca el autor.';
comment on column public.extras_manuales.creado_por is
  'Director que lo agregó. null si después se borró su cuenta: el extra queda para la historia de la cocina.';

create index extras_manuales_fecha_idx on public.extras_manuales (fecha, tiempo_comida);

-- ---------- ¿Todavía no cerró esa comida? ----------
-- Hora límite (horas_limite) sin pasar y sin cierre del job (comidas_cerradas). A diferencia de
-- comida_editable() no mira la ventana de la semana actual y la siguiente: un extra de dentro de un
-- mes tiene que poder quitarse. security definer: la usa una política y lee comidas_cerradas.
create function public.comida_sin_cerrar(
  p_fecha date,
  p_comida public.tiempo_comida,
  p_ahora timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1
        from public.horas_limite hl
       where hl.comida = p_comida
         and p_ahora < ((p_fecha + hl.dia_relativo) + hl.hora) at time zone public.zona_horaria_app()
    )
    and not exists (
      select 1 from public.comidas_cerradas c
       where c.fecha = p_fecha and c.comida = p_comida
    )
$$;

revoke execute on function public.comida_sin_cerrar(date, public.tiempo_comida, timestamptz) from public, anon;
grant execute on function public.comida_sin_cerrar(date, public.tiempo_comida, timestamptz) to authenticated, service_role;

-- ---------- RLS: solo el Director; sin UPDATE (se quita y se vuelve a agregar) ----------
alter table public.extras_manuales enable row level security;

revoke all on table public.extras_manuales from anon, authenticated;
grant select, delete on table public.extras_manuales to authenticated;
-- INSERT solo de lo que elige el Director: id y creado_en los pone la base.
grant insert (fecha, tiempo_comida, cantidad, nota, creado_por) on table public.extras_manuales to authenticated;
grant select, insert, update, delete on table public.extras_manuales to service_role;

create policy "extras_manuales: el Director los lee"
  on public.extras_manuales for select
  to authenticated
  using ((select public.mi_rol()) = 'director');

-- Desde hoy (hora de la casa), aunque esa comida ya haya cerrado: un invitado de último momento
-- también hay que avisarlo (la pantalla advierte que la cocina puede no verlo a tiempo). Un día
-- que ya pasó no le sirve a la cocina.
create policy "extras_manuales: el Director agrega desde hoy"
  on public.extras_manuales for insert
  to authenticated
  with check (
    (select public.mi_rol()) = 'director'
    and creado_por = (select auth.uid())
    and fecha >= (select (now() at time zone public.zona_horaria_app())::date)
  );

-- Solo mientras esa comida no cerró: después, la cocina ya pudo contarlo o prepararlo. comida_sin_cerrar
-- depende de la fila: no se envuelve en (select …).
create policy "extras_manuales: el Director quita mientras la comida no cerró"
  on public.extras_manuales for delete
  to authenticated
  using (
    (select public.mi_rol()) = 'director'
    and public.comida_sin_cerrar(fecha, tiempo_comida)
  );

-- ---------- Cenas extra de la semana: enlace público + manuales ----------
-- Misma firma y tipo que en 20260921201000_extras_administracion.sql. Ahora también responde al
-- Director (la tabla de "La casa" muestra lo mismo que ve la cocina).
create or replace function public.extras_de_la_semana(p_desde date, p_hasta date)
returns table (fecha date, tiempo_comida public.tiempo_comida, total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select x.fecha, x.tiempo_comida, sum(x.cantidad)::integer as total
    from (
      select e.fecha, l.tiempo_comida, c.cantidad_personas::integer as cantidad
        from public.confirmaciones_extra c
        join public.enlaces_confirmacion l on l.id = c.enlace_id
        join public.eventos e on e.id = l.evento_id
       where e.fecha between p_desde and p_hasta
      union all
      select m.fecha, m.tiempo_comida, m.cantidad::integer
        from public.extras_manuales m
       where m.fecha between p_desde and p_hasta
    ) x
   where (select public.mi_rol()) in ('administracion', 'director')
   group by x.fecha, x.tiempo_comida
$$;

-- ---------- Cada extra manual, sin autor ----------
-- Para Administración (la nota para la cocina) y el Director (la lista con "Quitar"). El id es un
-- uuid sin información: sirve de clave para quitar y para pintar la lista.
create function public.extras_manuales_de_la_semana(p_desde date, p_hasta date)
returns table (id uuid, fecha date, tiempo_comida public.tiempo_comida, cantidad integer, nota text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.fecha, m.tiempo_comida, m.cantidad::integer, m.nota
    from public.extras_manuales m
   where (select public.mi_rol()) in ('administracion', 'director')
     and m.fecha between p_desde and p_hasta
   order by m.fecha, m.tiempo_comida, m.creado_en
$$;

revoke execute on function public.extras_manuales_de_la_semana(date, date) from public, anon;
grant execute on function public.extras_manuales_de_la_semana(date, date) to authenticated, service_role;
