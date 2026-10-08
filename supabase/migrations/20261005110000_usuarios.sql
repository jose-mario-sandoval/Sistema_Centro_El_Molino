-- =========================================================
-- Cuentas: se entra con un nombre de usuario, no con el correo.
--
-- 1. perfiles.usuario: único, en minúsculas, 3 a 30 caracteres.
-- 2. Las cuentas que ya existen reciben su usuario:
--      - demo (@demo.test): demo.<lo de antes de la arroba>
--      - Administración:    admin.N, y pasan a llamarse "Administración N" / "AN"
--                           (la casa no ve el nombre real de Administración)
--      - la casa:           lo de antes de la arroba de su correo, limpio
--    Repetidos: al más antiguo le queda el limpio; a los siguientes, .2, .3…
-- 3. perfiles.correo deja de ser obligatorio: el código nuevo ya no lo escribe. La columna se
--    borra en una migración posterior, cuando el login nuevo esté comprobado.
--
-- Aplicar JUSTO ANTES de desplegar el código que entra por usuario. Al final devuelve la lista de
-- usuarios para repartir.
-- =========================================================

alter table public.perfiles add column usuario text;

-- La limpieza: espejo de usuarioDesdeCorreo() en lib/cuentas/usuario.ts (casos compartidos en
-- tests/fixtures/casos-usuario.json). Si cambia una, cambia la otra.
create function pg_temp.limpiar_usuario(p_correo text)
returns text
language sql
immutable
as $$
  with paso1 as (
    select translate(lower(split_part(p_correo, '@', 1)), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') as t
  ), paso2 as (
    select regexp_replace(t, '[^a-z0-9._-]', '', 'g') as t from paso1
  ), paso3 as (
    select regexp_replace(regexp_replace(t, '([._-])[._-]+', '\1', 'g'), '^[._-]+|[._-]+$', '', 'g') as t from paso2
  ), paso4 as (
    select regexp_replace(left(t, 30), '[._-]+$', '') as t from paso3
  ), paso5 as (
    -- Menos de 3 caracteres no es un usuario válido. Y `demo.` es de las cuentas de demo: una cuenta
    -- real cuyo correo empiece así no puede quedar con ese prefijo (limpiar-datos-demo la borraría).
    select case when length(t) < 3 or t like 'demo.%' then rtrim('cuenta.' || t, '.') else t end as t from paso4
  )
  select regexp_replace(left(t, 30), '[._-]+$', '') from paso5
$$;

do $$
declare
  r record;
  v_base text;
  v_usuario text;
  v_n integer;
  v_admin integer := 0;
begin
  -- Administración primero (sus admin.N no los toma nadie más): las reales y después las de demo, así
  -- las reales se numeran desde 1. Después la casa: las de demo y después las reales. Siempre por
  -- antigüedad dentro de cada grupo.
  for r in
    select p.id, p.correo, p.rol
    from public.perfiles p
    order by
      (p.rol = 'administracion') desc,
      ((p.correo like '%@demo.test') = (p.rol = 'administracion')),
      p.creado_en,
      p.id
  loop
    if r.rol = 'administracion' then
      v_admin := v_admin + 1;
      update public.perfiles
      set nombre = 'Administración ' || v_admin, siglas = 'A' || v_admin
      where id = r.id;
    end if;

    if r.correo like '%@demo.test' then
      v_base := 'demo.' || pg_temp.limpiar_usuario(r.correo);
    elsif r.rol = 'administracion' then
      v_base := 'admin.' || v_admin;
    else
      v_base := pg_temp.limpiar_usuario(r.correo);
    end if;
    -- Prefijos y sufijos cuentan dentro de los 30: si no entran, se recorta la base.
    v_base := regexp_replace(left(v_base, 30), '[._-]+$', '');

    v_usuario := v_base;
    v_n := 1;
    while exists (select 1 from public.perfiles p where p.usuario = v_usuario) loop
      v_n := v_n + 1;
      v_usuario := regexp_replace(left(v_base, 30 - length('.' || v_n)), '[._-]+$', '') || '.' || v_n;
    end loop;

    update public.perfiles set usuario = v_usuario where id = r.id;
  end loop;
end $$;

alter table public.perfiles
  alter column usuario set not null,
  add constraint perfiles_usuario_unico unique (usuario),
  add constraint perfiles_usuario_formato
    check (usuario ~ '^[a-z0-9]+([._-][a-z0-9]+)*$' and length(usuario) between 3 and 30),
  alter column correo drop not null;

comment on column public.perfiles.usuario is
  'Con lo que la persona entra. Lo pone y lo cambia el Director. Normalizado: minúsculas, sin tildes.';

-- La lista para repartir. AVISAR: su usuario no es, tal cual, lo de antes de la arroba de su correo
-- (Administración, repetidos, o un correo con caracteres que el usuario no admite).
select
  p.correo as "correo de antes",
  p.rol,
  p.usuario,
  case when p.usuario is distinct from lower(split_part(p.correo, '@', 1)) then 'AVISAR' else '' end as avisar
from public.perfiles p
order by p.rol, p.creado_en;
