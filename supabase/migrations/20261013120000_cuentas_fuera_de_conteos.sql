-- =========================================================
-- Cuentas fuera de los conteos (las de quienes desarrollan la app).
--
-- Quien desarrolla la app tiene una cuenta para probar, pero no vive en el Centro: no come ahí. Con
-- `fuera_de_conteos` la cuenta sigue entrando y usando la app, pero no cuenta como comensal: no sale
-- en La casa, ni en el resumen y las cantidades de la cocina, ni en los recordatorios de "sin definir".
-- No se cambia desde la app: lo pone quien administra la base (ver el final de este archivo).
-- =========================================================

alter table public.perfiles
  add column fuera_de_conteos boolean not null default false;

comment on column public.perfiles.fuera_de_conteos is
  'Cuenta de quien desarrolla la app: no es comensal del Centro. La app no la lista como persona con comidas y no recibe recordatorios de comidas sin definir.';

-- ---------- Recordatorios: sin las cuentas fuera de los conteos ----------
-- Igual que la de 20260921180100_ausencias.sql, más la condición `not pf.fuera_de_conteos`.
create or replace function public.comidas_sin_definir(p_fecha date, p_comida public.tiempo_comida)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select pf.id
    from public.perfiles pf
   where pf.activo
     and pf.rol in ('director', 'residente')
     and not pf.fuera_de_conteos
     and not exists (
       select 1
         from public.selecciones_comida s
        where s.usuario_id = pf.id
          and s.fecha = p_fecha
          and s.comida = p_comida
     )
     and not exists (
       select 1
         from public.ausencias a
        where a.usuario_id = pf.id
          and p_fecha between a.desde and a.hasta
     )
     and (
       not exists (
         select 1
           from public.plan_semanal p
          where p.usuario_id = pf.id
            and p.dia_semana = extract(isodow from p_fecha)::smallint
            and p.comida = p_comida
       )
       or exists (
         select 1
           from public.comidas_cerradas c
          where c.fecha = p_fecha
            and c.comida = p_comida
       )
     )
$$;

-- Para marcar la cuenta (una vez, en el SQL Editor), cambiando el usuario si hace falta:
--   update public.perfiles set fuera_de_conteos = true where usuario = 'demo';
