-- POLLOS ROLY · Vincula cuentas de usuario con el directorio usado por nómina.
-- Ejecutar después de 01_pollos_roly.sql y 05_roles_usuarios.sql.
begin;

create or replace function roly_private.sincronizar_perfil_personal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
begin
  v_nombre := coalesce(
    nullif(trim(concat_ws(' ', nullif(trim(new.nombre), ''), nullif(trim(new.apellido), ''))), ''),
    nullif(trim(new.correo_contacto), ''),
    'Usuario'
  );

  if new.rol in ('Supervisor', 'Cajero', 'Cocinero', 'Mesero', 'Repartidor', 'Limpieza')
     and new.sucursal_id is not null then
    insert into public.personal_operativo(id, nombre, rol, sucursal_id, telefono, activo)
    values (new.id, v_nombre, new.rol, new.sucursal_id, coalesce(new.telefono, ''), new.activo)
    on conflict (id) do update set
      nombre = excluded.nombre,
      rol = excluded.rol,
      sucursal_id = excluded.sucursal_id,
      telefono = excluded.telefono,
      activo = excluded.activo;
  else
    update public.personal_operativo
    set activo = false
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists sincronizar_perfil_personal on public.perfiles;
create trigger sincronizar_perfil_personal
after insert or update of nombre, apellido, correo_contacto, telefono, rol, sucursal_id, activo
on public.perfiles
for each row execute function roly_private.sincronizar_perfil_personal();

-- Importa las cuentas existentes con sucursal asignada para que aparezcan en nómina.
insert into public.personal_operativo(id, nombre, rol, sucursal_id, telefono, activo)
select p.id,
       coalesce(nullif(trim(concat_ws(' ', nullif(trim(p.nombre), ''), nullif(trim(p.apellido), ''))), ''), nullif(trim(p.correo_contacto), ''), 'Usuario'),
       p.rol, p.sucursal_id, coalesce(p.telefono, ''), p.activo
from public.perfiles as p
where p.rol in ('Supervisor', 'Cajero', 'Cocinero', 'Mesero', 'Repartidor', 'Limpieza')
  and p.sucursal_id is not null
on conflict (id) do update set
  nombre = excluded.nombre,
  rol = excluded.rol,
  sucursal_id = excluded.sucursal_id,
  telefono = excluded.telefono,
  activo = excluded.activo;

insert into public.roly_schema_version(version) values (9) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
