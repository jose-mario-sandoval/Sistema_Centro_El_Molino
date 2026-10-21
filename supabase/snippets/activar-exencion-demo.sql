-- Ejecutar como mantenimiento en el SQL Editor de Supabase, después de las migraciones
-- de Pensiones y exención. Solo localiza por usuario/nombre para esta activación inicial;
-- la regla persistente queda vinculada exclusivamente al UUID existente.
begin;

do $$
declare
  v_cuenta public.perfiles%rowtype;
begin
  select * into strict v_cuenta
  from public.perfiles
  where usuario = 'demo'
  for update;

  if regexp_replace(
    translate(lower(btrim(v_cuenta.nombre)), 'áéíóúüñ', 'aeiouun'),
    '[[:space:]]+', ' ', 'g'
  ) is distinct from 'dani y jose' then
    raise exception 'El usuario demo no corresponde a Dani y José. No se activó la exención.';
  end if;

  if not v_cuenta.activo or v_cuenta.rol not in ('director', 'residente') then
    raise exception 'La cuenta demo debe estar activa y ser Director o Residente.';
  end if;

  perform public.activar_exencion_pension(v_cuenta.id);

  if (select count(*) from public.pensiones_exencion) <> 1
    or not exists (
      select 1 from public.pensiones_exencion
      where usuario_id = v_cuenta.id
    ) then
    raise exception 'La exención no quedó vinculada exclusivamente a demo.';
  end if;

  if (select monto_centavos from public.valores_pension(
    v_cuenta.id, public.mes_actual_pensiones()
  )) is distinct from 0 then
    raise exception 'La pensión de demo no quedó en cero.';
  end if;
end;
$$;

select p.id, p.usuario, p.nombre, e.desde,
  v.monto_centavos as pension_centavos,
  public.pensiones_es_exento(p.id, public.mes_actual_pensiones()) as exento
from public.pensiones_exencion e
join public.perfiles p on p.id = e.usuario_id
cross join lateral public.valores_pension(
  p.id, public.mes_actual_pensiones()
) v;

commit;
