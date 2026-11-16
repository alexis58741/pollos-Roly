-- Guarda el sueldo mensual y calcula la multa según los minutos tarde.
-- Ejecutar después de database/25_personal_sin_cuenta.sql.
begin;

alter table public.personal_operativo add column if not exists sueldo_mensual numeric(12,2) not null default 0 check (sueldo_mensual >= 0);
alter table public.perfiles add column if not exists sueldo_mensual numeric(12,2) not null default 0 check (sueldo_mensual >= 0);

create or replace function roly_private.generar_multa_asistencia_tardia()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_hora time without time zone;
  v_tolerancia integer;
  v_monto_fijo numeric(12,2);
  v_sueldo numeric(12,2);
  v_registro timestamp without time zone;
  v_limite timestamp without time zone;
  v_minutos integer;
  v_multa numeric(12,2);
begin
  select hora_entrada_asistencia,tolerancia_asistencia_minutos,monto_multa_asistencia
    into v_hora,v_tolerancia,v_monto_fijo from public.configuracion where id=1;
  if not found or v_hora is null then return new; end if;
  v_registro:=new.registrada_en at time zone 'America/La_Paz';
  v_limite:=new.fecha+v_hora+make_interval(mins=>coalesce(v_tolerancia,0));
  if v_registro<=v_limite then return new; end if;
  v_minutos:=greatest(1,ceil(extract(epoch from (v_registro-v_limite))/60.0)::integer);
  if new.personal_id is not null then
    select sueldo_mensual into v_sueldo from public.personal_operativo where id=new.personal_id;
  elsif new.empleado_id is not null then
    select sueldo_mensual into v_sueldo from public.perfiles where id=new.empleado_id;
  end if;
  v_multa:=case when coalesce(v_sueldo,0)>0 then round((v_sueldo/30/8/60)*v_minutos,2) else coalesce(v_monto_fijo,0) end;
  insert into public.multas_asistencia(asistencia_id,empleado_id,personal_id,minutos_tarde,monto)
  values(new.id,new.empleado_id,new.personal_id,v_minutos,v_multa) on conflict(asistencia_id) do nothing;
  return new;
end;
$$;

revoke all on function roly_private.generar_multa_asistencia_tardia() from public,anon,authenticated;
insert into public.roly_schema_version(version) values(27) on conflict do nothing;
notify pgrst,'reload schema';
commit;
