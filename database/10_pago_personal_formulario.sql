-- POLLOS ROLY · Formulario ampliado de pagos al personal.
-- Ejecutar después de 01_pollos_roly.sql y 05_roles_usuarios.sql.
begin;

alter table public.pagos_personal
  alter column personal_id drop not null,
  add column if not exists nombre_empleado text not null default '',
  add column if not exists tipo_pago text not null default 'Pago Mensual',
  add column if not exists observaciones text not null default '';

update public.pagos_personal as pago
set nombre_empleado = coalesce(nullif(trim(personal.nombre), ''), 'Personal sin registrar')
from public.personal_operativo as personal
where pago.personal_id = personal.id
  and trim(pago.nombre_empleado) = '';

alter table public.pagos_personal
  drop constraint if exists pagos_personal_tipo_pago_check,
  drop constraint if exists pagos_personal_empleado_check;
alter table public.pagos_personal
  add constraint pagos_personal_tipo_pago_check
    check (tipo_pago in ('Pago Diario','Pago Semanal','Pago Quincenal','Pago Mensual','Horas Extra','Bono','Otro')),
  add constraint pagos_personal_empleado_check
    check (personal_id is not null or length(trim(nombre_empleado)) > 0);

create or replace function roly_private.validar_pago_personal()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_nombre text;
  v_sucursal uuid;
begin
  if tg_op = 'UPDATE' and old.estado = 'Pagado' then
    raise exception 'Un pago realizado es inmutable. Registra un movimiento de corrección.';
  end if;

  if new.personal_id is not null then
    select sucursal_id, nombre into v_sucursal, v_nombre
    from public.personal_operativo
    where id = new.personal_id;
    if not found then raise exception 'Personal no encontrado.'; end if;
    new.sucursal_id := v_sucursal;
    if trim(coalesce(new.nombre_empleado, '')) = '' then
      new.nombre_empleado := v_nombre;
    end if;
  else
    new.nombre_empleado := trim(coalesce(new.nombre_empleado, ''));
    if new.nombre_empleado = '' then raise exception 'Escribe el nombre del empleado.'; end if;
    if new.sucursal_id is null or not exists (select 1 from public.sucursales where id = new.sucursal_id) then
      raise exception 'Selecciona una sucursal válida.';
    end if;
  end if;

  return new;
end;
$$;

insert into public.roly_schema_version(version) values (10) on conflict do nothing;
notify pgrst, 'reload schema';
commit;
