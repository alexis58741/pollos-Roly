-- Hora de entrada y tolerancia únicas para todo el personal activo.
-- Ejecutar después de database/01_pollos_roly.sql.
begin;

alter table public.configuracion
  add column if not exists hora_entrada_asistencia time without time zone;

alter table public.configuracion
  add column if not exists tolerancia_asistencia_minutos smallint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.configuracion'::regclass
      and conname = 'configuracion_tolerancia_asistencia_rango'
  ) then
    alter table public.configuracion
      add constraint configuracion_tolerancia_asistencia_rango
      check (tolerancia_asistencia_minutos between 0 and 180);
  end if;
end;
$$;

insert into public.roly_schema_version(version) values (20) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
