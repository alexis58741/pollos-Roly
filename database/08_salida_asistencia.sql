-- POLLOS ROLY · Registrar hora de salida cuando el personal cierra sesión.
-- Ejecutar después de 01_pollos_roly.sql y 06/07 de asistencia.
begin;

alter table public.asistencias
  add column if not exists salida_en timestamptz;

create or replace function public.registrar_salida_asistencia()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    return;
  end if;

  select p.rol into v_role
  from public.perfiles as p
  where p.id = v_user_id and p.activo;

  if v_role is null or v_role not in ('Supervisor', 'Cocinero', 'Mesero', 'Repartidor', 'Limpieza') then
    return;
  end if;

  update public.asistencias as a
  set salida_en = coalesce(a.salida_en, now())
  where a.id = (
    select latest.id
    from public.asistencias as latest
    where latest.empleado_id = v_user_id
      and latest.fecha = (now() at time zone 'America/La_Paz')::date
      and latest.salida_en is null
    order by latest.registrada_en desc
    limit 1
  );
end;
$$;

revoke all on function public.registrar_salida_asistencia() from public, anon, authenticated;
grant execute on function public.registrar_salida_asistencia() to authenticated;

insert into public.roly_schema_version(version) values (8) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
