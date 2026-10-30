-- POLLOS ROLY · Roles adicionales para cuentas del sistema.
-- Ejecutar completo en Supabase SQL Editor después de los scripts anteriores.
-- Permite clasificar perfiles por los mismos roles del personal operativo.
begin;
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('Administrador','Supervisor','Cajero','Cocinero','Mesero','Repartidor','Limpieza'));
insert into public.roly_schema_version(version) values(5) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
